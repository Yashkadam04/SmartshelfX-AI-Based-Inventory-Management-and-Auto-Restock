import os
import traceback
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from decimal import Decimal

import numpy as np
import pandas as pd
import pymysql
import pymysql.cursors
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from xgboost import XGBRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error

load_dotenv()

app = FastAPI(title="SmartShelfX ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_CONFIG = {
    "host":     os.getenv("DB_HOST",   "localhost"),
    "port":     int(os.getenv("DB_PORT", 3306)),
    "db":       os.getenv("DB_NAME",   "smartshelfx"),
    "user":     os.getenv("DB_USER",   "root"),
    "password": os.getenv("DB_PASS",   ""),
    "charset":  "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

FORECAST_DAYS        = int(os.getenv("FORECAST_DAYS",        7))
MIN_TRAINING_RECORDS = int(os.getenv("MIN_TRAINING_RECORDS", 5))


# ── Helpers ───────────────────────────────────────────────────────────

def to_int(v):
    if v is None: return 0
    if isinstance(v, Decimal): return int(v)
    return int(v)

def to_float(v):
    if v is None: return 0.0
    if isinstance(v, Decimal): return float(v)
    return float(v)

def serialize_row(row: dict) -> dict:
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in row.items()}


# ── Pydantic Models ───────────────────────────────────────────────────

class ForecastItem(BaseModel):
    product_id:    int
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
    product_id:     int
    product_name:   str
    sku:            str
    current_stock:  int
    reorder_level:  int
    forecasts:      List[ForecastItem]
    model_accuracy: Optional[float]


# ── Database ──────────────────────────────────────────────────────────

def get_connection():
    try:
        return pymysql.connect(**DB_CONFIG)
    except pymysql.Error as e:
        print(f"[DB ERROR] {e}")
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")


def get_all_products() -> List[Dict[str, Any]]:
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, sku, category, current_stock, reorder_level FROM products ORDER BY id")
    rows   = cursor.fetchall()
    cursor.close()
    conn.close()
    return [{**r, "current_stock": to_int(r["current_stock"]), "reorder_level": to_int(r["reorder_level"])} for r in rows]


def get_transactions(product_id: int) -> pd.DataFrame:
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DATE(timestamp) AS tx_date, type, SUM(quantity) AS daily_qty
        FROM stock_transactions
        WHERE product_id = %s AND timestamp >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY DATE(timestamp), type
        ORDER BY tx_date ASC
    """, (product_id,))
    rows   = cursor.fetchall()
    cursor.close()
    conn.close()

    if not rows:
        return pd.DataFrame(columns=["tx_date", "type", "daily_qty"])

    df = pd.DataFrame(rows)
    df["tx_date"]   = pd.to_datetime(df["tx_date"])
    df["daily_qty"] = df["daily_qty"].apply(to_float)
    return df


# ── ML Logic ──────────────────────────────────────────────────────────

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
    pid     = to_int(product["id"])
    stock   = to_int(product["current_stock"])
    reorder = to_int(product["reorder_level"])

    df      = get_transactions(pid)
    out_df  = df[df["type"] == "OUT"].copy()

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

    out_df  = build_features(out_df)
    X       = out_df[FEATURES].values
    y       = out_df["daily_qty"].values

    split       = max(1, int(len(X) * 0.8))
    X_tr, X_va  = X[:split], X[split:]
    y_tr, y_va  = y[:split], y[split:]

    scaler      = StandardScaler()
    X_tr_sc     = scaler.fit_transform(X_tr)
    model       = XGBRegressor(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbosity=0
    )
    model.fit(X_tr_sc, y_tr)

    confidence  = 0.75
    if len(X_va) > 0:
        y_pred  = model.predict(scaler.transform(X_va))
        mae     = mean_absolute_error(y_va, y_pred)
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

    preds    = np.clip(model.predict(scaler.transform(future_X)), 0, None)
    total    = float(np.sum(preds))

    return {
        "product_id":    pid,
        "forecast_date": target_date.isoformat(),
        "predicted_qty": round(total, 2),
        "confidence":    round(float(confidence), 4),
        "risk_level":    risk_level(stock, reorder, total)
    }


def save_forecast(f: Dict[str, Any]):
    conn   = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM forecast_results WHERE product_id = %s", (f["product_id"],))
    cursor.execute(
        "INSERT INTO forecast_results (product_id, forecast_date, predicted_qty, confidence, risk_level) VALUES (%s, %s, %s, %s, %s)",
        (f["product_id"], f["forecast_date"], f["predicted_qty"], f["confidence"], f["risk_level"])
    )
    conn.commit()
    cursor.close()
    conn.close()


# ── Routes ────────────────────────────────────────────────────────────

@app.get("/")
def health_check():
    try:
        conn   = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM products")
        count  = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        db = f"connected ({count} products)"
    except Exception as e:
        db = f"error: {e}"
    return {"status": "ok", "service": "SmartShelfX ML", "database": db}


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
def forecast_single(product_id: int):
    try:
        conn   = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, sku, current_stock, reorder_level FROM products WHERE id = %s", (product_id,))
        p = cursor.fetchone()
        cursor.close()
        conn.close()

        if not p:
            raise HTTPException(status_code=404, detail="Product not found")

        p["current_stock"] = to_int(p["current_stock"])
        p["reorder_level"] = to_int(p["reorder_level"])

        result    = forecast_product(p)
        save_forecast(result)
        forecasts = [ForecastItem(**result)]

        return ProductForecastResponse(
            product_id=to_int(p["id"]),
            product_name=p["name"],
            sku=p["sku"],
            current_stock=to_int(p["current_stock"]),
            reorder_level=to_int(p["reorder_level"]),
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
        conn   = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.id, p.name, p.sku, p.current_stock, p.reorder_level,
                COALESCE(SUM(CASE WHEN t.type='OUT' THEN t.quantity ELSE 0 END), 0) AS total_out_30d,
                COALESCE(SUM(CASE WHEN t.type='IN'  THEN t.quantity ELSE 0 END), 0) AS total_in_30d,
                COALESCE(AVG(CASE WHEN t.type='OUT' THEN t.quantity END), 0)         AS avg_daily_demand
            FROM products p
            LEFT JOIN stock_transactions t ON p.id = t.product_id
                AND t.timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY p.id, p.name, p.sku, p.current_stock, p.reorder_level
            ORDER BY total_out_30d DESC
        """)
        products = [serialize_row(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT fr.risk_level, COUNT(*) AS count
            FROM forecast_results fr
            INNER JOIN (
                SELECT product_id, MAX(created_at) AS max_created FROM forecast_results GROUP BY product_id
            ) latest ON fr.product_id = latest.product_id AND fr.created_at = latest.max_created
            GROUP BY fr.risk_level
        """)
        risk_dist = [serialize_row(r) for r in cursor.fetchall()]
        cursor.close()
        conn.close()

        return {"products": products, "risk_distribution": risk_dist, "generated_at": datetime.utcnow().isoformat() + "Z"}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analytics/velocity")
def stock_velocity():
    try:
        conn   = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.id, p.name, p.sku, p.category, p.current_stock,
                COALESCE(SUM(t.quantity), 0)                  AS units_sold_7d,
                ROUND(COALESCE(SUM(t.quantity), 0) / 7.0, 2) AS daily_velocity,
                CASE WHEN COALESCE(SUM(t.quantity), 0) = 0 THEN 999
                     ELSE ROUND(p.current_stock / (COALESCE(SUM(t.quantity), 0) / 7.0), 1)
                END AS days_of_stock_remaining
            FROM products p
            LEFT JOIN stock_transactions t ON p.id = t.product_id
                AND t.type = 'OUT' AND t.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY p.id, p.name, p.sku, p.category, p.current_stock
            ORDER BY days_of_stock_remaining ASC
        """)
        rows = [serialize_row(r) for r in cursor.fetchall()]
        cursor.close()
        conn.close()
        return {"velocity": rows, "generated_at": datetime.utcnow().isoformat() + "Z"}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("ML_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)