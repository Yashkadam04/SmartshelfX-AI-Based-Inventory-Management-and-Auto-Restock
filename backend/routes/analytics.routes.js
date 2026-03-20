const express = require('express');
const { Product, StockTransaction, PurchaseOrder } = require('../models');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authenticate);

// GET /api/analytics/summary
router.get('/summary', async (req, res) => {
    try {
        const [totalProducts, outOfStockItems, pendingOrders, lowStock] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ current_stock: 0 }),
            PurchaseOrder.countDocuments({ status: 'PENDING', vendor_id: { $ne: null } }),
            Product.aggregate([
                { $match: { current_stock: { $gt: 0 } } },
                { $match: { $expr: { $lte: ['$current_stock', '$reorder_level'] } } },
                { $count: 'count' }
            ])
        ]);

        res.json({
            totalProducts,
            lowStockItems: lowStock[0]?.count || 0,
            outOfStockItems,
            pendingOrders
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/stock-trend
router.get('/stock-trend', async (req, res) => {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const rows = await StockTransaction.aggregate([
            { $match: { timestamp: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        month: { $dateToString: { format: '%Y-%m', date: '$timestamp' } },
                        type: '$type'
                    },
                    total: { $sum: '$quantity' }
                }
            },
            {
                $project: {
                    _id: 0,
                    month: '$_id.month',
                    type: '$_id.type',
                    total: 1
                }
            },
            { $sort: { month: 1 } }
        ]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/top-restocked
router.get('/top-restocked', async (req, res) => {
    try {
        const rows = await StockTransaction.aggregate([
            { $match: { type: 'IN' } },
            { $group: { _id: '$product_id', total_restocked: { $sum: '$quantity' } } },
            { $sort: { total_restocked: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $project: {
                    _id: 0,
                    name: '$product.name',
                    sku: '$product.sku',
                    total_restocked: 1
                }
            }
        ]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/category-breakdown
router.get('/category-breakdown', async (req, res) => {
    try {
        const rows = await Product.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    total_stock: { $sum: '$current_stock' }
                }
            },
            { $project: { _id: 0, category: '$_id', count: 1, total_stock: 1 } },
            { $sort: { count: -1 } }
        ]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/low-stock
router.get('/low-stock', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const products = await Product.aggregate([
            {
                $match: {
                    $or: [
                        { current_stock: 0 },
                        { $expr: { $lte: ['$current_stock', '$reorder_level'] } }
                    ]
                }
            },
            { $sort: { current_stock: 1 } },
            { $limit: Number(limit) }
        ]);

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
