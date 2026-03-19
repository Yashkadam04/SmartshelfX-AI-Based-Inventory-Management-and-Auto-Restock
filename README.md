# SmartShelfX — AI-Powered Inventory Management & Auto-Restock Platform

![SmartShelfX](https://img.shields.io/badge/SmartShelfX-v1.0.0-00b4ff?style=for-the-badge)
![Angular](https://img.shields.io/badge/Angular-19-DD0031?style=for-the-badge&logo=angular)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb)
![Python](https://img.shields.io/badge/Python-ML_Service-3776AB?style=for-the-badge&logo=python)

> SmartShelfX is a next-generation inventory management platform designed to optimize 
stock levels using AI-powered demand forecasting. The system analyzes historical 
sales, seasonal trends, and real-time data to recommend and automate restocking 
operations. Built using Angular 19 for the frontend, Node.js (Express) for the backend, 
and MySQL for data storage, SmartShelfX provides a smart dashboard, real-time alerts, 
and automated purchase order suggestions, ensuring minimal stockouts and 
overstocking. 

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Environment Variables](#-environment-variables)
- [Running the Project](#-running-the-project)
- [API Endpoints](#-api-endpoints)
- [User Roles](#-user-roles)
- [Usage Guide](#-usage-guide)
- [Screenshots](#-screenshots)

---

## ✨ Features

### 🤖 AI & Forecasting
- AI-powered demand forecasting using Python ML service
- Predicts stock requirements for the next 7 days
- Risk level classification: **LOW / MEDIUM / HIGH / CRITICAL**
- Auto-triggers purchase orders for HIGH/CRITICAL risk products
- Manual forecast run by Admin/Manager at any time

### 📦 Inventory Management
- Full product CRUD with SKU, category, vendor, expiry date
- Real-time stock tracking with IN/OUT transactions
- Bulk product import via CSV, Excel (.xlsx), TSV, ODS files
- Smart column auto-mapping on file import
- Stock status filters: In Stock, Low, Critical, Out of Stock

### 🔔 Smart Alerts
- Automatic LOW_STOCK, OUT_OF_STOCK, EXPIRY alerts
- AI-generated RESTOCK_SUGGESTED alerts
- Vendor-specific alert feed
- Mark as read / dismiss alerts

### 📊 Analytics Dashboard
- KPI summary: Total Products, Low Stock, Out of Stock, Pending Orders
- Monthly Purchase vs Sales bar chart (6 months)
- Stock by Category doughnut chart
- Inventory Level Trend line chart
- Top 10 most restocked products

### 🛒 Purchase Order Workflow
- Auto-generated POs when stock is LOW/CRITICAL
- Manual PO creation by Admin/Manager
- Vendor approves or cancels POs
- Status pipeline: PENDING → APPROVED → DISPATCHED → DELIVERED / CANCELLED
- Email notifications to vendors on new POs
- Email notifications to managers when vendor approves/rejects

### 🔐 Authentication & Roles
- JWT-based authentication
- Three role types: ADMIN, MANAGER, VENDOR
- Separate Admin login portal (port 4201)
- Role-based route protection

### ⏰ Background Scheduler
- Runs every 2 minutes
- Auto-scans all products for HIGH/CRITICAL stock levels
- Auto-creates POs and emails vendors if no open PO exists

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Angular 19 (Standalone Components) |
| **UI Library** | Angular Material 19, Chart.js 4, ng2-charts |
| **Fonts** | Orbitron, Rajdhani, JetBrains Mono |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB (via Mongoose ODM) |
| **Authentication** | JWT (jsonwebtoken), bcryptjs |
| **ML Service** | Python (FastAPI / Flask) |
| **Email** | Nodemailer (Gmail SMTP) |
| **File Import** | csv-parser, xlsx |
| **HTTP Client** | Axios (backend → ML service) |

---

## 📁 Project Structure

```
SmartShelfx/
│
├── backend/                        # Node.js + Express API
│   ├── config/
│   │   └── database.js             # MongoDB/Mongoose connection
│   ├── middleware/
│   │   └── auth.middleware.js      # JWT authentication + role guard
│   ├── models/
│   │   └── index.js                # All 6 Mongoose models
│   ├── routes/
│   │   ├── auth.routes.js          # Register, Login, /me, /users
│   │   ├── product.routes.js       # Product CRUD + file import
│   │   ├── transaction.routes.js   # Stock IN/OUT transactions
│   │   ├── order.routes.js         # Purchase order management
│   │   ├── forecast.routes.js      # AI forecast trigger + results
│   │   ├── alert.routes.js         # Vendor alerts
│   │   └── analytics.routes.js     # Dashboard analytics
│   ├── utils/
│   │   ├── alertHelper.js          # Auto alert + PO creation logic
│   │   ├── poScheduler.js          # Background PO scheduler (2 min)
│   │   └── mailer.js               # Email templates (Nodemailer)
│   ├── .env                        # Environment variables
│   ├── package.json
│   ├── reset-passwords.js          # Utility to reset all user passwords
│   └── server.js                   # App entry point
│
├── frontend/                       # Angular 19 SPA
│   ├── src/
│   │   ├── app/
│   │   │   ├── auth/
│   │   │   │   ├── login/          # Manager/Vendor login
│   │   │   │   └── admin-login/    # Admin-only login portal
│   │   │   ├── dashboard/          # Main dashboard
│   │   │   ├── products/           # Product management
│   │   │   ├── transactions/       # Stock transactions
│   │   │   ├── orders/             # Purchase orders
│   │   │   ├── forecast/           # AI forecast view
│   │   │   ├── alerts/             # Vendor alert feed
│   │   │   ├── analytics/          # Charts & reports
│   │   │   └── shared/
│   │   │       ├── services/       # ApiService, AuthService, NotificationService
│   │   │       └── models/         # TypeScript interfaces
│   │   ├── styles.css              # Global dark theme + design system
│   │   └── index.html
│   ├── proxy.conf.json             # Angular dev proxy → backend :3000
│   ├── start-dev.js                # Starts both port 4200 and 4201
│   └── package.json
│
└── ml-service/                     # Python AI/ML forecasting service
    ├── main.py                     # FastAPI/Flask entry point
    ├── model/                      # Trained forecasting model
    ├── requirements.txt
    └── .env
```

---

## ✅ Prerequisites

Make sure you have the following installed before setting up the project:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | v18+ | https://nodejs.org |
| **npm** | v9+ | Comes with Node.js |
| **MongoDB** | v6+ | https://www.mongodb.com/try/download/community |
| **Python** | v3.9+ | https://www.python.org/downloads |
| **Angular CLI** | v19 | `npm install -g @angular/cli` |
| **Git** | Latest | https://git-scm.com |

---

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Shreyash0895/SmartshelfX-AI-Based-Inventory-Management-and-Auto-Restock.git
cd SmartShelfx
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create your `.env` file (see [Environment Variables](#-environment-variables) below), then:

```bash
node server.js
```

You should see:
```
✅ MongoDB connected.
✅ SmartShelfX API running on http://localhost:3000
[Scheduler] PO auto-check started — runs every 2 minutes.
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
node start-dev.js
```

Wait ~30-60 seconds for Angular to compile. You'll see:
```
✔ [ADMIN] Ready → http://localhost:4201
✔ [USERS] Ready → http://localhost:4200
```

### 4. ML Service Setup

```bash
cd ../ml-service
pip install -r requirements.txt
python main.py
```

ML service starts on `http://localhost:8000`

### 5. Seed Initial Users (First Time Only)

```bash
cd backend
node reset-passwords.js
```

This resets all user passwords to `Admin@123` and prints all login credentials.

---

## 🔧 Environment Variables

Create a `.env` file inside the `backend/` folder:

```env
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/smartshelfx

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# ML Service
ML_SERVICE_URL=http://localhost:8000

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=SmartShelfX <noreply@smartshelfx.com>

# Frontend URL (for email links)
APP_URL=http://localhost:4200
```

> **Note:** For Gmail, use an **App Password** (not your regular password).  
> Generate one at: Google Account → Security → 2-Step Verification → App Passwords

---

## ▶️ Running the Project

Start services in this order:

| Step | Command | URL |
|------|---------|-----|
| 1. MongoDB | `mongod` | — |
| 2. Backend | `cd backend && node server.js` | http://localhost:3000 |
| 3. ML Service | `cd ml-service && python main.py` | http://localhost:8000 |
| 4. Frontend | `cd frontend && node start-dev.js` | http://localhost:4200 / 4201 |

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/register` | Public | Register a new user |
| POST | `/api/auth/login` | Public | Login and get JWT token |
| GET | `/api/auth/me` | All roles | Get current user profile |
| GET | `/api/auth/users` | All roles | List all users |

### Products
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/products` | All | List products (search, filter, paginate) |
| GET | `/api/products/categories` | All | Get distinct categories |
| GET | `/api/products/:id` | All | Get single product |
| POST | `/api/products` | Admin/Manager | Create product |
| PUT | `/api/products/:id` | Admin/Manager | Update product |
| DELETE | `/api/products/:id` | Admin only | Delete product |
| POST | `/api/products/import-sheet` | Admin/Manager | Bulk import from file |
| POST | `/api/products/preview-sheet` | Admin/Manager | Preview file before import |

### Transactions
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/transactions` | All | List transactions |
| POST | `/api/transactions` | Admin/Manager | Record stock IN/OUT |
| GET | `/api/transactions/product/:id` | All | Transactions for a product |

### Purchase Orders
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/orders` | All | List orders |
| GET | `/api/orders/suggestions` | All | AI-suggested restock orders |
| POST | `/api/orders` | Admin/Manager | Create purchase order |
| PUT | `/api/orders/:id/status` | All | Update order status |

### Forecast
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/forecast` | All | Get all forecast results |
| POST | `/api/forecast/run` | Admin/Manager | Trigger AI forecast |
| GET | `/api/forecast/:product_id` | All | Forecast for a product |
| POST | `/api/forecast/trigger-alerts` | Admin/Manager | Re-create forecast alerts |

### Alerts
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/alerts` | Vendor | Get vendor alerts |
| PUT | `/api/alerts/read-all` | Vendor | Mark all as read |
| PUT | `/api/alerts/:id/read` | Vendor | Mark single alert as read |
| DELETE | `/api/alerts/:id` | Vendor | Dismiss alert |

### Analytics
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/analytics/summary` | All | KPI summary cards |
| GET | `/api/analytics/stock-trend` | All | 6-month stock trend |
| GET | `/api/analytics/top-restocked` | All | Top 10 restocked products |
| GET | `/api/analytics/category-breakdown` | All | Stock by category |
| GET | `/api/analytics/low-stock` | All | Low/out of stock products |

---

## 👥 User Roles

| Role | Permissions |
|------|------------|
| **ADMIN** | Full access — manage users, products, orders, forecasts, delete products, view all analytics |
| **MANAGER** | Create/edit products, record transactions, create orders, run AI forecasts, view analytics |
| **VENDOR** | View their own purchase orders, approve/cancel orders, receive alerts, view their products |

### Default Login URLs
- **Manager / Vendor:** http://localhost:4200
- **Admin:** http://localhost:4201

---

## 📖 Usage Guide

### First Time Setup
1. Start all 4 services (MongoDB, Backend, ML Service, Frontend)
2. Run `node reset-passwords.js` to create initial users with password `Admin@123`
3. Open http://localhost:4201 and log in as Admin

### Adding Products
1. Log in as **Admin** or **Manager**
2. Go to **Products** → Click **Add Product**
3. Fill in Name, SKU, Category, Vendor, Stock, Reorder Level, Price
4. Or use **Import** to bulk upload a CSV/Excel file

### Recording Stock Transactions
1. Go to **Transactions** → Click **New Transaction**
2. Select product, type (IN/OUT), quantity
3. Stock is updated in real-time and alerts are auto-triggered if needed

### Running AI Forecast
1. Log in as **Admin** or **Manager**
2. Go to **Forecast** → Click **Run Forecast**
3. The ML service analyses historical data and generates risk predictions
4. HIGH/CRITICAL products automatically get alerts and purchase orders created

### Managing Purchase Orders (Vendor)
1. Log in as **Vendor** at http://localhost:4200
2. Go to **Orders** to see all pending POs assigned to you
3. Click **Approve** or **Cancel** — managers are notified by email automatically

### Viewing Alerts (Vendor)
1. Log in as **Vendor**
2. Go to **Alerts** to see LOW_STOCK, OUT_OF_STOCK, and AI RESTOCK alerts
3. Filter by type or read/unread status
4. Click an alert to mark it as read, or dismiss it

 🗄️ Database Models

| Model | Description |
|-------|-------------|
| `User` | System users with roles (ADMIN/MANAGER/VENDOR) |
| `Product` | Inventory items with SKU, stock levels, pricing |
| `StockTransaction` | Every stock IN/OUT movement |
| `PurchaseOrder` | Restock orders with full status pipeline |
| `Alert` | Vendor-targeted notifications |
| `ForecastResult` | AI model output per product per date |

 📧 Email Notifications

SmartShelfX sends automated emails in two scenarios:

1. **New Purchase Order → Vendor**
   - Triggered when a PO is created (manual or auto)
   - Contains order details and a link to review

2. **Vendor Decision → All Managers**
   - Triggered when a vendor approves or cancels a PO
   - Contains the decision, product details, and order summary

 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request


👨‍💻 Author:-Shreyash Jokare

GitHub: https://github.com/Shreyash0895
