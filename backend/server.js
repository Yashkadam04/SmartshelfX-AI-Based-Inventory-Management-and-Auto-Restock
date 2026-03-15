require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { connectDB } = require('./config/database');

const authRoutes        = require('./routes/auth.routes');
const productRoutes     = require('./routes/product.routes');
const transactionRoutes = require('./routes/transaction.routes');
const forecastRoutes    = require('./routes/forecast.routes');
const orderRoutes       = require('./routes/order.routes');
const alertRoutes       = require('./routes/alert.routes');
const analyticsRoutes   = require('./routes/analytics.routes');
const { startPOScheduler } = require('./utils/poScheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => res.json({ status: 'ok', message: 'SmartShelfX API is running' }));

app.get('/api/health', (req, res) => res.json({
    status: 'ok', service: 'SmartShelfX API',
    version: '1.0.0', timestamp: new Date().toISOString()
}));

app.use('/api/auth',         authRoutes);
app.use('/api/products',     productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/forecast',     forecastRoutes);
app.use('/api/orders',       orderRoutes);
app.use('/api/alerts',       alertRoutes);
app.use('/api/analytics',    analyticsRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// Global error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const start = async () => {
    try {
        await connectDB();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ SmartShelfX API running on http://localhost:${PORT}`);
            console.log(`   Health check: http://localhost:${PORT}/api/health`);
            startPOScheduler();
        });
    } catch (err) {
        console.error('❌ Startup failed:', err.message);
        process.exit(1);
    }
};

start();