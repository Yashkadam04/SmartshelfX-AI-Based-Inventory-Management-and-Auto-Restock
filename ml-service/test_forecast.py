import os, sys, traceback
from decimal import Decimal
from datetime import datetime, timedelta

# Test 1: DB connection
print("TEST 1: Database connection...")
try:
    import mysql.connector
    conn = mysql.connector.connect(
        host="localhost", port=3306,
        database="smartshelfx", user="root", password=""
    )
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT COUNT(*) as cnt FROM products")
    r = cursor.fetchone()
    print(f"  ✅ Connected — {r['cnt']} products found")
    
    cursor.execute("SELECT COUNT(*) as cnt FROM stock_transactions")
    r2 = cursor.fetchone()
    print(f"  ✅ {r2['cnt']} transactions found")
    
    cursor.execute("SHOW TABLES LIKE 'forecast_results'")
    r3 = cursor.fetchone()
    print(f"  {'✅' if r3 else '❌'} forecast_results table {'exists' if r3 else 'MISSING'}")
    
    cursor.close()
    conn.close()
except Exception as e:
    print(f"  ❌ DB ERROR: {e}")
    sys.exit(1)

# Test 2: Pydantic
print("\nTEST 2: Pydantic model_accuracy conflict...")
try:
    from pydantic import BaseModel, ConfigDict
    from typing import Optional, List
    class TestResponse(BaseModel):
        model_config = ConfigDict(protected_namespaces=())
        model_accuracy: Optional[float]
    t = TestResponse(model_accuracy=0.85)
    print(f"  ✅ Pydantic OK — {t.model_accuracy}")
except Exception as e:
    print(f"  ❌ Pydantic ERROR: {e}")
    traceback.print_exc()

# Test 3: Decimal serialization
print("\nTEST 3: MySQL Decimal types...")
try:
    conn = mysql.connector.connect(
        host="localhost", port=3306,
        database="smartshelfx", user="root", password=""
    )
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, current_stock, reorder_level, unit_price FROM products LIMIT 3")
    rows = cursor.fetchall()
    for r in rows:
        for k,v in r.items():
            if isinstance(v, Decimal):
                print(f"  ⚠️  Column '{k}' is Decimal type = {v} — needs conversion")
            else:
                print(f"  ✅ Column '{k}' = {v} ({type(v).__name__})")
    cursor.close()
    conn.close()
except Exception as e:
    print(f"  ❌ ERROR: {e}")

# Test 4: sklearn
print("\nTEST 4: scikit-learn...")
try:
    import numpy as np
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import StandardScaler
    X = np.array([[1,2],[3,4],[5,6]])
    y = np.array([1,2,3])
    sc = StandardScaler()
    model = LinearRegression()
    model.fit(sc.fit_transform(X), y)
    print(f"  ✅ sklearn OK — prediction: {model.predict(sc.transform([[2,3]]))[0]:.2f}")
except Exception as e:
    print(f"  ❌ sklearn ERROR: {e}")
    traceback.print_exc()

# Test 5: Full forecast run
print("\nTEST 5: Full forecast simulation...")
try:
    conn = mysql.connector.connect(
        host="localhost", port=3306,
        database="smartshelfx", user="root", password=""
    )
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, name, current_stock, reorder_level FROM products LIMIT 1")
    product = cursor.fetchone()
    cursor.close()
    conn.close()
    
    if product:
        print(f"  Testing with: {product['name']}")
        print(f"  current_stock type: {type(product['current_stock']).__name__} = {product['current_stock']}")
        print(f"  reorder_level type: {type(product['reorder_level']).__name__} = {product['reorder_level']}")
        
        stock = int(product['current_stock']) if isinstance(product['current_stock'], Decimal) else product['current_stock']
        reorder = int(product['reorder_level']) if isinstance(product['reorder_level'], Decimal) else product['reorder_level']
        print(f"  ✅ After conversion: stock={stock}, reorder={reorder}")
except Exception as e:
    print(f"  ❌ ERROR: {e}")
    traceback.print_exc()

print("\n✅ All tests done. Check above for ❌ errors.")