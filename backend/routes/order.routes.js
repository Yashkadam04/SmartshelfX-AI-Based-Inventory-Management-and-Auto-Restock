const express = require('express');
const { PurchaseOrder, Product, User, ForecastResult } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { sendPurchaseOrderEmail, sendManagerNotificationEmail } = require('../utils/mailer');

const router = express.Router();
router.use(authenticate);

// GET /api/orders/suggestions
router.get('/suggestions', async (req, res) => {
    try {
        const forecasts = await ForecastResult.find({ risk_level: { $in: ['HIGH', 'CRITICAL'] } })
            .populate({
                path: 'product_id',
                populate: { path: 'vendor_id', select: 'id name email' }
            })
            .sort({ 'product_id.current_stock': 1 })
            .limit(50);

        const suggestions = forecasts.map(f => {
            const p = f.product_id;
            return {
                id:            f._id,
                product_id:    p?._id,
                forecast_date: f.forecast_date,
                predicted_qty: f.predicted_qty,
                confidence:    f.confidence,
                risk_level:    f.risk_level,
                Product: {
                    id:            p?._id,
                    name:          p?.name || 'Unknown',
                    sku:           p?.sku || '',
                    category:      p?.category || '',
                    current_stock: p?.current_stock || 0,
                    reorder_level: p?.reorder_level || 0,
                    unit_price:    p?.unit_price || 0,
                    vendor_id:     p?.vendor_id?._id || null,
                    vendor:        p?.vendor_id || null
                }
            };
        });

        res.json(suggestions);
    } catch (err) {
        console.error('[GET /orders/suggestions] error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/orders
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, vendor_id } = req.query;
        const skip  = (Number(page) - 1) * Number(limit);
        const query = {};

        if (status) query.status = status;
        if (req.user.role === 'VENDOR') {
            query.vendor_id = req.user._id;
        } else if (vendor_id) {
            query.vendor_id = vendor_id;
        }

        const [rows, total] = await Promise.all([
            PurchaseOrder.find(query)
                .populate('product_id', 'id name sku category unit_price')
                .populate('vendor_id', 'id name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            PurchaseOrder.countDocuments(query)
        ]);

        res.json({ total, page: Number(page), data: rows });
    } catch (err) {
        console.error('[GET /orders] error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await PurchaseOrder.findById(req.params.id)
            .populate('product_id')
            .populate('vendor_id', 'id name email');

        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (req.user.role === 'VENDOR' && String(order.vendor_id?._id) !== String(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/orders
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const { product_id, vendor_id, quantity, notes } = req.body;
        if (!product_id || !quantity) return res.status(400).json({ error: 'product_id and quantity are required' });

        const product = await Product.findById(product_id).populate('vendor_id', 'id name email');
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const resolvedVendorId = vendor_id || product.vendor_id?._id || null;

        const order = await PurchaseOrder.create({
            product_id,
            vendor_id: resolvedVendorId,
            quantity:  Number(quantity),
            status:    'PENDING',
            notes:     notes || null
        });

        if (resolvedVendorId) {
            const vendor = await User.findById(resolvedVendorId).select('name email');
            if (vendor?.email) {
                try {
                    await sendPurchaseOrderEmail({
                        vendorEmail: vendor.email, vendorName: vendor.name,
                        productName: product.name, productSku: product.sku,
                        quantity: Number(quantity), orderId: order._id, notes: notes || null
                    });
                } catch (mailErr) { console.error('Email failed:', mailErr.message); }
            }
        }

        const fullOrder = await PurchaseOrder.findById(order._id)
            .populate('product_id', 'id name sku')
            .populate('vendor_id', 'id name email');

        res.status(201).json(fullOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/orders/:id/status
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['PENDING', 'APPROVED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const order = await PurchaseOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (req.user.role === 'VENDOR') {
            if (String(order.vendor_id) !== String(req.user._id)) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (!['APPROVED', 'CANCELLED'].includes(status)) {
                return res.status(403).json({ error: 'Vendors can only approve or cancel orders' });
            }
        }

        order.status = status;
        await order.save();

        const updatedOrder = await PurchaseOrder.findById(order._id)
            .populate('product_id', 'id name sku')
            .populate('vendor_id', 'id name email');

        // Email managers when vendor approves/rejects
        if (req.user.role === 'VENDOR' && ['APPROVED', 'CANCELLED'].includes(status)) {
            try {
                const managers = await User.find({ role: { $in: ['ADMIN', 'MANAGER'] } }).select('name email');
                for (const mgr of managers) {
                    if (mgr.email) {
                        await sendManagerNotificationEmail({
                            managerEmail: mgr.email, managerName: mgr.name,
                            vendorName:   updatedOrder.vendor_id?.name || 'Vendor',
                            productName:  updatedOrder.product_id?.name || 'Unknown',
                            productSku:   updatedOrder.product_id?.sku || '—',
                            quantity:     updatedOrder.quantity,
                            orderId:      updatedOrder._id,
                            decision:     status,
                            notes:        updatedOrder.notes || null
                        });
                    }
                }
            } catch (mailErr) { console.error('Manager notification email failed:', mailErr.message); }
        }

        res.json(updatedOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
