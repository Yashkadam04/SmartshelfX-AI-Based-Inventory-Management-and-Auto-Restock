import os
import traceback
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from pymongo import MongoClient
from bson import ObjectId
from xgboost import XGBRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error

load_dotenv()

app = FastAPI(title="SmartShelfX ML Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MongoDB Connection ─────────────────────────────────────────────────
MONGO_URI            = os.getenv("MONGO_URI", "mongodb://localhost:27017/smartshelfx")
FORECAST_DAYS        = int(os.getenv("FORECAST_DAYS",        7))
MIN_TRAINING_RECORDS = int(os.getenv("MIN_TRAINING_RECORDS", 5))

# Mongoose pluralizes + lowercases model names:
# Product         → products
# StockTransaction → stocktransactions
# ForecastResult  → forecastresults

_mongo_client = None

def get_db():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return _mongo_client["smartshelfx"]


# ── Pydantic Models ────────────────────────────────────────────────────

class ForecastItem(BaseModel):
    product_id:    str
    forecast_date: str
    predicted_qty: float
    confidence:    float
    risk_level:    str


class ForecastResponse(BaseModel):
    model_config   = ConfigDict(protected_namespaces=())
    forecasts:      List[ForecastItem]
    model_accuracy: Optional[float]
    trained_at:     str
    total_products: int


class ProductForecastResponse(BaseModel):
    model_config   = ConfigDict(protected_namespaces=())
    product_id:     str
    product_name:   str
    sku:            str
    current_stock:  int
    reorder_level:  int
    forecasts:      List[ForecastItem]
    model_accuracy: Optional[float]


# ── Database Helpers ───────────────────────────────────────────────────

def get_all_products() -> List[Dict[str, Any]]:
    db       = get_db()
    products = list(db["products"].find({}, {
        "_id": 1, "name": 1, "sku": 1, "category": 1,
        "current_stock": 1, "reorder_level": 1
    }))
    result = []
    for p in products:
        result.append({
            "id":            str(p["_id"]),
            "name":          p.get("name", ""),
            "sku":           p.get("sku", ""),
            "category":      p.get("category", ""),
            "current_stock": int(p.get("current_stock", 0)),
            "reorder_level": int(p.get("reorder_level", 10))
        })
    return result


def get_transactions(product_id: str) -> pd.DataFrame:
    db    = get_db()
    since = datetime.now() - timedelta(days=90)

    # Try both collection name variants
    for col_name in ["stocktransactions", "stock_transactions"]:
        try:
            pipeline = [
                {
                    "$match": {
                        "product_id": ObjectId(product_id),
                        "timestamp":  {"$gte": since}
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                            "type": "$type"
                        },
                        "daily_qty": {"$sum": "$quantity"}
                    }
                },
                {
                    "$project": {
                        "_id":       0,
                        "tx_date":   "$_id.date",
                        "type":      "$_id.type",
                        "daily_qty": 1
                    }
                },
                {"$sort": {"tx_date": 1}}
            ]
            rows = list(db[col_name].aggregate(pipeline))
            if rows:
                df              = pd.DataFrame(rows)
                df["tx_date"]   = pd.to_datetime(df["tx_date"])
                df["daily_qty"] = df["daily_qty"].astype(float)
                return df
        except Exception:
            continue

    return pd.DataFrame(columns=["tx_date", "type", "daily_qty"])


def save_forecast(f: Dict[str, Any]):
    db = get_db()
    # Try both collection name variants
    for col_name in ["forecastresults", "forecast_results"]:
        try:
            db[col_name].update_one(
                {"product_id": ObjectId(f["product_id"])},
                {"$set": {
                    "product_id":    ObjectId(f["product_id"]),
                    "forecast_date": datetime.strptime(f["forecast_date"], "%Y-%m-%d"),
                    "predicted_qty": f["predicted_qty"],
                    "confidence":    f["confidence"],
                    "risk_level":    f["risk_level"],
                    "createdAt":     datetime.utcnow()
                }},
                upsert=True
            )
            return
        except Exception:
            continue


# ── ML Logic ───────────────────────────────────────────────────────────

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["day_of_week"]    = df["tx_date"].dt.dayofweek
    df["day_of_month"]   = df["tx_date"].dt.day
    df["month"]          = df["tx_date"].dt.month
    df["week_of_year"]   = df["tx_date"].dt.isocalendar().week.astype(int)
    df["rolling_7d_avg"] = df["daily_qty"].rolling(7, min_periods=1).mean()
    return df


def risk_level(current_stock: int, reorder_level: int, predicted_qty: float) -> str:
    if current_stock == 0:
        return "CRITICAL"
    if predicted_qty <= 0:
        return "LOW"
    days = current_stock / predicted_qty
    if current_stock <= reorder_level * 0.5 or days < 3:
        return "CRITICAL"
    if current_stock <= reorder_level or days < 7:
        return "HIGH"
    if current_stock <= reorder_level * 1.5 or days < 14:
        return "MEDIUM"
    return "LOW"


FEATURES = ["day_of_week", "day_of_month", "month", "week_of_year", "rolling_7d_avg"]


def forecast_product(product: Dict[str, Any]) -> Dict[str, Any]:
    pid     = product["id"]
    stock   = int(product["current_stock"])
    reorder = int(product["reorder_level"])

    df     = get_transactions(pid)
    out_df = df[df["type"] == "OUT"].copy()

    target_date = (datetime.now() + timedelta(days=FORECAST_DAYS)).date()

    # Not enough data — use simple estimate
    if len(out_df) < MIN_TRAINING_RECORDS:
        avg_daily = max(stock * 0.05, 1.0)
        predicted = round(avg_daily * FORECAST_DAYS, 2)
        return {
            "product_id":    pid,
            "forecast_date": target_date.isoformat(),
            "predicted_qty": predicted,
            "confidence":    0.50,
            "risk_level":    risk_level(stock, reorder, predicted)
        }

    out_df = build_features(out_df)
    X      = out_df[FEATURES].values
    y      = out_df["daily_qty"].values

    split      = max(1, int(len(X) * 0.8))
    X_tr, X_va = X[:split], X[split:]
    y_tr, y_va = y[:split], y[split:]

    scaler   = StandardScaler()
    X_tr_sc  = scaler.fit_transform(X_tr)
    model    = XGBRegressor(
        n_estimators=100, max_depth=4,
        learning_rate=0.1, subsample=0.8,
        colsample_bytree=0.8, random_state=42, verbosity=0
    )
    model.fit(X_tr_sc, y_tr)

    confidence = 0.75
    if len(X_va) > 0:
        y_pred     = model.predict(scaler.transform(X_va))
        mae        = mean_absolute_error(y_va, y_pred)
        confidence = max(0.40, min(0.99, 1.0 - mae / (np.mean(y_va) + 1e-6)))

    rolling_avg  = float(out_df["daily_qty"].tail(7).mean())
    future_dates = [datetime.now().date() + timedelta(days=i) for i in range(1, FORECAST_DAYS + 1)]
    future_X     = pd.DataFrame([{
        "day_of_week":    d.weekday(),
        "day_of_month":   d.day,
        "month":          d.month,
        "week_of_year":   d.isocalendar()[1],
        "rolling_7d_avg": rolling_avg
    } for d in future_dates])[FEATURES].values

    preds = np.clip(model.predict(scaler.transform(future_X)), 0, None)
    total = float(np.sum(preds))

    return {
        "product_id":    pid,
        "forecast_date": target_date.isoformat(),
        "predicted_qty": round(total, 2),
        "confidence":    round(float(confidence), 4),
        "risk_level":    risk_level(stock, reorder, total)
    }


# ── Routes ─────────────────────────────────────────────────────────────

@app.get("/")
def health_check():
    try:
        db    = get_db()
        count = db["products"].count_documents({})
        # Also check collection names
        cols  = db.list_collection_names()
        return {
            "status":      "ok",
            "service":     "SmartShelfX ML",
            "database":    f"MongoDB connected ({count} products)",
            "collections": cols
        }
    except Exception as e:
        return {"status": "error", "database": str(e)}


@app.post("/forecast", response_model=ForecastResponse)
def run_forecast():
    try:
        products  = get_all_products()
        forecasts = []
        errors    = []

        print(f"\n[FORECAST] Starting for {len(products)} products...")

        for p in products:
            try:
                result = forecast_product(p)
                save_forecast(result)
                forecasts.append(ForecastItem(**result))
                print(f"  ✓ {p['name']} → {result['risk_level']} ({result['predicted_qty']} units)")
            except Exception as e:
                print(f"  ✗ Product {p['id']} ({p.get('name','?')}): {e}")
                traceback.print_exc()
                errors.append({"product_id": p["id"], "error": str(e)})

        avg_conf = sum(f.confidence for f in forecasts) / len(forecasts) if forecasts else 0.0
        print(f"[FORECAST] Done: {len(forecasts)} success, {len(errors)} failed\n")

        return ForecastResponse(
            forecasts=forecasts,
            model_accuracy=round(avg_conf, 4),
            trained_at=datetime.utcnow().isoformat() + "Z",
            total_products=len(forecasts)
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/forecast/{product_id}", response_model=ProductForecastResponse)
def forecast_single(product_id: str):
    try:
        db = get_db()
        p  = db["products"].find_one({"_id": ObjectId(product_id)})
        if not p:
            raise HTTPException(status_code=404, detail="Product not found")

        product = {
            "id":            str(p["_id"]),
            "name":          p.get("name", ""),
            "sku":           p.get("sku", ""),
            "current_stock": int(p.get("current_stock", 0)),
            "reorder_level": int(p.get("reorder_level", 10))
        }

        result    = forecast_product(product)
        save_forecast(result)
        forecasts = [ForecastItem(**result)]

        return ProductForecastResponse(
            product_id=product["id"],
            product_name=product["name"],
            sku=product["sku"],
            current_stock=product["current_stock"],
            reorder_level=product["reorder_level"],
            forecasts=forecasts,
            model_accuracy=forecasts[0].confidence
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analytics/demand-summary")
def demand_summary():
    try:
        db       = get_db()
        products = get_all_products()
        since_30 = datetime.now() - timedelta(days=30)
        result   = []

        tx_col = "stocktransactions"
        if "stock_transactions" in db.list_collection_names():
            tx_col = "stock_transactions"

        for p in products:
            pid      = p["id"]
            pipeline = [
                {"$match": {"product_id": ObjectId(pid), "timestamp": {"$gte": since_30}}},
                {"$group": {
                    "_id":   "$type",
                    "total": {"$sum": "$quantity"},
                    "avg":   {"$avg": "$quantity"}
                }}
            ]
            tx_data = {r["_id"]: r for r in db[tx_col].aggregate(pipeline)}
            result.append({
                "id":               pid,
                "name":             p["name"],
                "sku":              p["sku"],
                "current_stock":    p["current_stock"],
                "reorder_level":    p["reorder_level"],
                "total_out_30d":    tx_data.get("OUT", {}).get("total", 0),
                "total_in_30d":     tx_data.get("IN",  {}).get("total", 0),
                "avg_daily_demand": round(tx_data.get("OUT", {}).get("avg", 0), 2)
            })

        result.sort(key=lambda x: x["total_out_30d"], reverse=True)

        fc_col = "forecastresults"
        if "forecast_results" in db.list_collection_names():
            fc_col = "forecast_results"

        risk_pipeline = [
            {"$sort":  {"createdAt": -1}},
            {"$group": {"_id": "$product_id", "risk_level": {"$first": "$risk_level"}}},
            {"$group": {"_id": "$risk_level", "count": {"$sum": 1}}}
        ]
        risk_dist = [{"risk_level": r["_id"], "count": r["count"]}
                     for r in db[fc_col].aggregate(risk_pipeline)]

        return {
            "products":          result,
            "risk_distribution": risk_dist,
            "generated_at":      datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analytics/velocity")
def stock_velocity():
    try:
        db       = get_db()
        products = get_all_products()
        since_7  = datetime.now() - timedelta(days=7)
        result   = []

        tx_col = "stocktransactions"
        if "stock_transactions" in db.list_collection_names():
            tx_col = "stock_transactions"

        for p in products:
            pid      = p["id"]
            pipeline = [
                {"$match": {"product_id": ObjectId(pid), "type": "OUT", "timestamp": {"$gte": since_7}}},
                {"$group": {"_id": None, "total": {"$sum": "$quantity"}}}
            ]
            tx       = list(db[tx_col].aggregate(pipeline))
            sold_7d  = tx[0]["total"] if tx else 0
            velocity = round(sold_7d / 7.0, 2)
            days_rem = round(p["current_stock"] / velocity, 1) if velocity > 0 else 999

            result.append({
                "id":                      pid,
                "name":                    p["name"],
                "sku":                     p["sku"],
                "category":                p["category"],
                "current_stock":           p["current_stock"],
                "units_sold_7d":           sold_7d,
                "daily_velocity":          velocity,
                "days_of_stock_remaining": days_rem
            })

        result.sort(key=lambda x: x["days_of_stock_remaining"])
        return {"velocity": result, "generated_at": datetime.utcnow().isoformat() + "Z"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("ML_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)