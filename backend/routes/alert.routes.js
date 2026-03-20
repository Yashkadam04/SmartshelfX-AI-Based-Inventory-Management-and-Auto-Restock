const express = require('express');
const { Op } = require('sequelize');
const { Alert, Product } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authenticate);

// GET /alerts — VENDORS only. Admin/Manager always get empty.
router.get('/', async (req, res) => {
    try {
        // Admin and Manager do NOT receive alerts — alerts are for vendors only
        if (req.user.role !== 'VENDOR') {
            return res.json({ total: 0, unread: 0, page: 1, data: [] });
        }

        const { type, is_read, product_id, page = 1, limit = 50 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const where = { vendor_id: req.user.id };
        if (type) where.type = type;
        if (product_id) where.product_id = Number(product_id);
        if (is_read !== undefined && is_read !== '') {
            where.is_read = is_read === 'true' || is_read === true;
        }

        const { count, rows } = await Alert.findAndCountAll({
            where,
            include: [{
                model: Product,
                as: 'Product',
                attributes: ['id', 'name', 'sku', 'category', 'current_stock', 'reorder_level']
            }],
            order: [['created_at', 'DESC']],
            limit: Number(limit),
            offset
        });

        const unread = await Alert.count({ where: { vendor_id: req.user.id, is_read: false } });

        res.json({ total: count, unread, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /alerts/read-all
router.put('/read-all', async (req, res) => {
    try {
        if (req.user.role !== 'VENDOR') return res.json({ success: true });
        await Alert.update({ is_read: true }, { where: { is_read: false, vendor_id: req.user.id } });
        res.json({ success: true, message: 'All alerts marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /alerts/:id/read
router.put('/:id/read', async (req, res) => {
    try {
        const alert = await Alert.findByPk(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alert not found' });
        if (req.user.role === 'VENDOR' && alert.vendor_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await alert.update({ is_read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /alerts/:id
router.delete('/:id', async (req, res) => {
    try {
        const alert = await Alert.findByPk(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alert not found' });
        if (req.user.role === 'VENDOR' && alert.vendor_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await alert.destroy();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
