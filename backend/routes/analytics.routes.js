const express = require('express');
const { Product, StockTransaction, PurchaseOrder, User } = require('../models');
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
        res.json({ totalProducts, lowStockItems: lowStock[0]?.count || 0, outOfStockItems, pendingOrders });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/analytics/stock-trend
router.get('/stock-trend', async (req, res) => {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const rows = await StockTransaction.aggregate([
            { $match: { timestamp: { $gte: sixMonthsAgo } } },
            { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$timestamp' } }, type: '$type' }, total: { $sum: '$quantity' } } },
            { $project: { _id: 0, month: '$_id.month', type: '$_id.type', total: 1 } },
            { $sort: { month: 1 } }
        ]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/analytics/top-restocked
router.get('/top-restocked', async (req, res) => {
    try {
        const rows = await StockTransaction.aggregate([
            { $match: { type: 'IN' } },
            { $group: { _id: '$product_id', total_restocked: { $sum: '$quantity' } } },
            { $sort: { total_restocked: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $project: { _id: 0, name: '$product.name', sku: '$product.sku', total_restocked: 1 } }
        ]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/analytics/category-breakdown
router.get('/category-breakdown', async (req, res) => {
    try {
        const rows = await Product.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 }, total_stock: { $sum: '$current_stock' } } },
            { $project: { _id: 0, category: '$_id', count: 1, total_stock: 1 } },
            { $sort: { count: -1 } }
        ]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/analytics/low-stock
router.get('/low-stock', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const products = await Product.aggregate([
            { $match: { $or: [{ current_stock: 0 }, { $expr: { $lte: ['$current_stock', '$reorder_level'] } }] } },
            { $sort: { current_stock: 1 } },
            { $limit: Number(limit) }
        ]);
        res.json(products);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/analytics/valuation
router.get('/valuation', async (req, res) => {
    try {
        const [totalValuation, atRiskValuation, categoryValuation, topValuableProducts, deadStock] = await Promise.all([
            Product.aggregate([{ $group: { _id: null, total_value: { $sum: { $multiply: ['$current_stock', '$unit_price'] } }, total_units: { $sum: '$current_stock' }, total_products: { $sum: 1 } } }]),
            Product.aggregate([
                { $match: { $or: [{ current_stock: 0 }, { $expr: { $lte: ['$current_stock', '$reorder_level'] } }] } },
                { $group: { _id: null, at_risk_value: { $sum: { $multiply: ['$current_stock', '$unit_price'] } }, at_risk_products: { $sum: 1 } } }
            ]),
            Product.aggregate([
                { $group: { _id: '$category', category_value: { $sum: { $multiply: ['$current_stock', '$unit_price'] } }, total_units: { $sum: '$current_stock' }, product_count: { $sum: 1 } } },
                { $project: { _id: 0, category: '$_id', category_value: 1, total_units: 1, product_count: 1 } },
                { $sort: { category_value: -1 } }
            ]),
            Product.aggregate([
                { $project: { name: 1, sku: 1, category: 1, current_stock: 1, unit_price: 1, total_value: { $multiply: ['$current_stock', '$unit_price'] } } },
                { $sort: { total_value: -1 } },
                { $limit: 5 }
            ]),
            Product.aggregate([
                { $match: { current_stock: 0, unit_price: { $gt: 0 } } },
                { $group: { _id: null, dead_stock_count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            total_inventory_value: totalValuation[0]?.total_value      || 0,
            total_units:           totalValuation[0]?.total_units       || 0,
            total_products:        totalValuation[0]?.total_products    || 0,
            at_risk_value:         atRiskValuation[0]?.at_risk_value    || 0,
            at_risk_products:      atRiskValuation[0]?.at_risk_products || 0,
            dead_stock_count:      deadStock[0]?.dead_stock_count       || 0,
            category_valuation:    categoryValuation,
            top_valuable_products: topValuableProducts
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/analytics/reorder-suggestions ──────────────────────────────────
router.get('/reorder-suggestions', async (req, res) => {
    try {
        const DEFAULT_LEAD_TIME_DAYS = 7;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get all products at/below reorder level
        const products = await Product.find({
            $or: [
                { current_stock: 0 },
                { $expr: { $lte: ['$current_stock', '$reorder_level'] } }
            ]
        }).populate('vendor_id', 'name email');

        const suggestions = await Promise.all(products.map(async (product) => {
            // Avg daily usage from last 30 days OUT transactions
            const outTx = await StockTransaction.aggregate([
                { $match: { product_id: product._id, type: 'OUT', timestamp: { $gte: thirtyDaysAgo } } },
                { $group: { _id: null, total_out: { $sum: '$quantity' } } }
            ]);

            const totalOut30Days    = outTx[0]?.total_out || 0;
            const avgDailyUsage     = parseFloat((totalOut30Days / 30).toFixed(2));
            const stockDuringLead   = Math.ceil(avgDailyUsage * DEFAULT_LEAD_TIME_DAYS);
            const safetyStock       = Math.ceil(stockDuringLead * 0.5);
            const recommendedQty    = Math.max(product.reorder_level * 2, stockDuringLead + safetyStock, 10);

            let urgency = 'MEDIUM';
            if (product.current_stock === 0)                                   urgency = 'CRITICAL';
            else if (product.current_stock <= product.reorder_level * 0.5)    urgency = 'HIGH';
            else if (product.current_stock <= product.reorder_level)           urgency = 'MEDIUM';

            const daysUntilStockout = avgDailyUsage > 0
                ? Math.floor(product.current_stock / avgDailyUsage)
                : null;

            return {
                product_id:          product._id,
                product_name:        product.name,
                sku:                 product.sku,
                category:            product.category,
                current_stock:       product.current_stock,
                reorder_level:       product.reorder_level,
                unit_price:          product.unit_price,
                vendor:              product.vendor_id || null,
                avg_daily_usage:     avgDailyUsage,
                lead_time_days:      DEFAULT_LEAD_TIME_DAYS,
                stock_during_lead:   stockDuringLead,
                safety_stock:        safetyStock,
                recommended_qty:     recommendedQty,
                estimated_cost:      parseFloat((recommendedQty * product.unit_price).toFixed(2)),
                urgency,
                days_until_stockout: daysUntilStockout,
                has_open_po:         false
            };
        }));

        // Mark products that already have open POs
        const openPOs = await PurchaseOrder.find({ status: { $in: ['PENDING', 'APPROVED'] } }).select('product_id');
        const openPOSet = new Set(openPOs.map(po => String(po.product_id)));

        const result = suggestions
            .map(s => ({ ...s, has_open_po: openPOSet.has(String(s.product_id)) }))
            .sort((a, b) => {
                const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                return (order[a.urgency] ?? 4) - (order[b.urgency] ?? 4);
            });

        res.json({ total: result.length, lead_time: DEFAULT_LEAD_TIME_DAYS, suggestions: result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/analytics/vendor-performance ───────────────────────────────────
router.get('/vendor-performance', async (req, res) => {
    try {
        const vendors = await User.find({ role: 'VENDOR' }).select('_id name email');
        if (vendors.length === 0) return res.json({ total_vendors: 0, vendors: [] });

        const vendorStats = await Promise.all(vendors.map(async (vendor) => {
            const allOrders = await PurchaseOrder.find({ vendor_id: vendor._id });

            const totalOrders      = allOrders.length;
            const pendingOrders    = allOrders.filter(o => o.status === 'PENDING').length;
            const approvedOrders   = allOrders.filter(o => o.status === 'APPROVED').length;
            const deliveredOrders  = allOrders.filter(o => o.status === 'DELIVERED').length;
            const cancelledOrders  = allOrders.filter(o => o.status === 'CANCELLED').length;
            const dispatchedOrders = allOrders.filter(o => o.status === 'DISPATCHED').length;

            const actionableOrders  = totalOrders - pendingOrders;
            const fulfillmentRate   = actionableOrders > 0 ? parseFloat(((deliveredOrders / actionableOrders) * 100).toFixed(1)) : 0;
            const rejectionRate     = totalOrders > 0 ? parseFloat(((cancelledOrders / totalOrders) * 100).toFixed(1)) : 0;

            // Avg response time
            const respondedOrders = allOrders.filter(o => ['APPROVED','CANCELLED','DELIVERED','DISPATCHED'].includes(o.status) && o.createdAt);
            let avgResponseHours = null;
            if (respondedOrders.length > 0) {
                const totalHours = respondedOrders.reduce((sum, o) => {
                    return sum + (new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60);
                }, 0);
                avgResponseHours = parseFloat((totalHours / respondedOrders.length).toFixed(1));
            }

            const totalQtySupplied = allOrders.filter(o => o.status === 'DELIVERED').reduce((sum, o) => sum + o.quantity, 0);

            // Value supplied
            const deliveredProductIds = allOrders.filter(o => o.status === 'DELIVERED').map(o => o.product_id);
            const productPrices = await Product.find({ _id: { $in: deliveredProductIds } }).select('_id unit_price');
            const priceMap = {};
            productPrices.forEach(p => { priceMap[String(p._id)] = p.unit_price; });
            const totalValueSupplied = parseFloat(allOrders
                .filter(o => o.status === 'DELIVERED')
                .reduce((sum, o) => sum + (o.quantity * (priceMap[String(o.product_id)] || 0)), 0)
                .toFixed(2));

            // Performance score (0-100)
            const fulfillScore   = fulfillmentRate * 0.6;
            const rejectionScore = (100 - rejectionRate) * 0.2;
            const responseScore  = avgResponseHours !== null
                ? (avgResponseHours <= 24 ? 20 : avgResponseHours <= 48 ? 15 : avgResponseHours <= 72 ? 10 : 5)
                : 10;
            const performanceScore = Math.min(100, Math.round(fulfillScore + rejectionScore + responseScore));

            let rating = 'No Data';
            if (totalOrders > 0) {
                if (performanceScore >= 80)      rating = '⭐⭐⭐⭐⭐ Excellent';
                else if (performanceScore >= 60) rating = '⭐⭐⭐⭐ Good';
                else if (performanceScore >= 40) rating = '⭐⭐⭐ Average';
                else if (performanceScore >= 20) rating = '⭐⭐ Below Average';
                else                             rating = '⭐ Poor';
            }

            const assignedProducts = await Product.countDocuments({ vendor_id: vendor._id });

            return {
                vendor_id:            vendor._id,
                vendor_name:          vendor.name,
                vendor_email:         vendor.email,
                assigned_products:    assignedProducts,
                total_orders:         totalOrders,
                pending_orders:       pendingOrders,
                approved_orders:      approvedOrders,
                dispatched_orders:    dispatchedOrders,
                delivered_orders:     deliveredOrders,
                cancelled_orders:     cancelledOrders,
                fulfillment_rate:     fulfillmentRate,
                rejection_rate:       rejectionRate,
                avg_response_hours:   avgResponseHours,
                total_qty_supplied:   totalQtySupplied,
                total_value_supplied: totalValueSupplied,
                performance_score:    performanceScore,
                rating
            };
        }));

        vendorStats.sort((a, b) => b.performance_score - a.performance_score);
        res.json({ total_vendors: vendors.length, vendors: vendorStats });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;