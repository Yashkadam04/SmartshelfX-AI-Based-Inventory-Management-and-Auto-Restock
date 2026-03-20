const express = require('express');
const { PurchaseOrder, Product, User, sequelize } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { sendPurchaseOrderEmail, sendManagerNotificationEmail } = require('../utils/mailer');

const router = express.Router();

router.use(authenticate);

// ── GET /orders/suggestions ──────────────────────────────────────────────────
router.get('/suggestions', async (req, res) => {
    try {
        const [rows] = await sequelize.query(`
      SELECT
        f.id, f.product_id, f.forecast_date,
        f.predicted_qty, f.confidence, f.risk_level,
        p.name AS p_name, p.sku AS p_sku, p.category AS p_cat,
        p.current_stock, p.reorder_level, p.unit_price, p.vendor_id,
        u.id AS v_id, u.name AS v_name, u.email AS v_email
      FROM forecast_results f
      LEFT JOIN products p ON p.id = f.product_id
      LEFT JOIN users   u ON u.id = p.vendor_id
      WHERE f.risk_level IN ('HIGH','CRITICAL')
      ORDER BY p.current_stock ASC, f.risk_level DESC
      LIMIT 50
    `);

        const suggestions = (rows || []).map(r => ({
            id: r.id,
            product_id: Number(r.product_id),
            forecast_date: r.forecast_date,
            predicted_qty: Number(r.predicted_qty) || 0,
            confidence: Number(r.confidence) || 0,
            risk_level: r.risk_level || 'LOW',
            Product: {
                id: Number(r.product_id),
                name: r.p_name || ('Product #' + r.product_id),
                sku: r.p_sku || '',
                category: r.p_cat || '',
                current_stock: Number(r.current_stock) || 0,
                reorder_level: Number(r.reorder_level) || 0,
                unit_price: Number(r.unit_price) || 0,
                vendor_id: r.vendor_id || null,
                vendor: r.v_id ? { id: r.v_id, name: r.v_name, email: r.v_email } : null
            }
        }));

        res.json(suggestions);
    } catch (err) {
        console.error('[GET /orders/suggestions] error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /orders ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, status, vendor_id } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const where = {};
        if (status) where.status = status;

        if (req.user.role === 'VENDOR') {
            where.vendor_id = Number(req.user.id);
        } else if (vendor_id) {
            where.vendor_id = Number(vendor_id);
        }

        const { count, rows } = await PurchaseOrder.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'Product', attributes: ['id', 'name', 'sku', 'category', 'unit_price'] },
                { model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }
            ],
            order: [['id', 'DESC']],
            limit: Number(limit),
            offset
        });

        res.json({ total: count, page: Number(page), data: rows });
    } catch (err) {
        console.error('[GET /orders] error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /orders/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const order = await PurchaseOrder.findByPk(req.params.id, {
            include: [
                { model: Product, as: 'Product' },
                { model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }
            ]
        });

        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (req.user.role === 'VENDOR' && Number(order.vendor_id) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /orders — manually create PO ───────────────────────────────────────
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const { product_id, vendor_id, quantity, notes } = req.body;

        if (!product_id || !quantity) {
            return res.status(400).json({ error: 'product_id and quantity are required' });
        }

        const product = await Product.findByPk(product_id, {
            include: [{ model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }]
        });
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const resolvedVendorId = vendor_id || product.vendor_id;

        const order = await PurchaseOrder.create({
            product_id: Number(product_id),
            vendor_id: resolvedVendorId ? Number(resolvedVendorId) : null,
            quantity: Number(quantity),
            status: 'PENDING',
            notes: notes || null
        });

        if (resolvedVendorId) {
            const vendor = await User.findByPk(resolvedVendorId, { attributes: ['name', 'email'] });
            if (vendor && vendor.email) {
                try {
                    await sendPurchaseOrderEmail({
                        vendorEmail: vendor.email,
                        vendorName: vendor.name,
                        productName: product.name,
                        productSku: product.sku,
                        quantity: Number(quantity),
                        orderId: order.id,
                        notes: notes || null
                    });
                } catch (mailErr) {
                    console.error('Email failed:', mailErr.message);
                }
            }
        }

        const fullOrder = await PurchaseOrder.findByPk(order.id, {
            include: [
                { model: Product, as: 'Product', attributes: ['id', 'name', 'sku'] },
                { model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }
            ]
        });

        res.status(201).json(fullOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /orders/:id/status ───────────────────────────────────────────────────
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;

        const validStatuses = ['PENDING', 'APPROVED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const order = await PurchaseOrder.findByPk(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (req.user.role === 'VENDOR') {
            if (Number(order.vendor_id) !== Number(req.user.id)) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (!['APPROVED', 'CANCELLED'].includes(status)) {
                return res.status(403).json({ error: 'Vendors can only approve or cancel orders' });
            }
        }

        await order.update({ status });

        const updatedOrder = await PurchaseOrder.findByPk(order.id, {
            include: [
                { model: Product, as: 'Product', attributes: ['id', 'name', 'sku'] },
                { model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }
            ]
        });

        // ── Email managers when vendor approves or rejects ───────────
        if (req.user.role === 'VENDOR' && ['APPROVED', 'CANCELLED'].includes(status)) {
            try {
                const managers = await User.findAll({
                    where: { role: ['ADMIN', 'MANAGER'] },
                    attributes: ['name', 'email']
                });
                for (const mgr of managers) {
                    if (mgr.email) {
                        await sendManagerNotificationEmail({
                            managerEmail: mgr.email,
                            managerName: mgr.name,
                            vendorName: updatedOrder.vendor?.name || 'Vendor',
                            productName: updatedOrder.Product?.name || 'Unknown',
                            productSku: updatedOrder.Product?.sku || '—',
                            quantity: updatedOrder.quantity,
                            orderId: updatedOrder.id,
                            decision: status,
                            notes: updatedOrder.notes || null
                        });
                    }
                }
            } catch (mailErr) {
                console.error('Manager notification email failed:', mailErr.message);
            }
        }

        res.json(updatedOrder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
