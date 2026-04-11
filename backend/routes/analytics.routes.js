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

// GET /api/analytics/valuation
router.get('/valuation', async (req, res) => {
    try {

        // ── Total inventory value ─────────────────────────────────
        const totalValuation = await Product.aggregate([
            {
                $group: {
                    _id: null,
                    total_value: {
                        $sum: { $multiply: ['$current_stock', '$unit_price'] }
                    },
                    total_units: { $sum: '$current_stock' },
                    total_products: { $sum: 1 }
                }
            }
        ]);

        // ── Value at risk (low + critical + out of stock) ─────────
        const atRiskValuation = await Product.aggregate([
            {
                $match: {
                    $or: [
                        { current_stock: 0 },
                        { $expr: { $lte: ['$current_stock', '$reorder_level'] } }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    at_risk_value: {
                        $sum: { $multiply: ['$current_stock', '$unit_price'] }
                    },
                    at_risk_products: { $sum: 1 }
                }
            }
        ]);

        // ── Category-wise valuation ───────────────────────────────
        const categoryValuation = await Product.aggregate([
            {
                $group: {
                    _id: '$category',
                    category_value: {
                        $sum: { $multiply: ['$current_stock', '$unit_price'] }
                    },
                    total_units: { $sum: '$current_stock' },
                    product_count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    category_value: 1,
                    total_units: 1,
                    product_count: 1
                }
            },
            { $sort: { category_value: -1 } }
        ]);

        // ── Top 5 most valuable products ──────────────────────────
        const topValuableProducts = await Product.aggregate([
            {
                $project: {
                    name: 1,
                    sku: 1,
                    category: 1,
                    current_stock: 1,
                    unit_price: 1,
                    total_value: { $multiply: ['$current_stock', '$unit_price'] }
                }
            },
            { $sort: { total_value: -1 } },
            { $limit: 5 }
        ]);

        // ── Dead stock (zero stock but has price) ─────────────────
        const deadStock = await Product.aggregate([
            {
                $match: {
                    current_stock: 0,
                    unit_price: { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: null,
                    dead_stock_count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            total_inventory_value:  totalValuation[0]?.total_value    || 0,
            total_units:            totalValuation[0]?.total_units     || 0,
            total_products:         totalValuation[0]?.total_products  || 0,
            at_risk_value:          atRiskValuation[0]?.at_risk_value  || 0,
            at_risk_products:       atRiskValuation[0]?.at_risk_products || 0,
            dead_stock_count:       deadStock[0]?.dead_stock_count     || 0,
            category_valuation:     categoryValuation,
            top_valuable_products:  topValuableProducts
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;