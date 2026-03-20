const express              = require('express');
const { Alert, Product }   = require('../models');
const { authenticate }     = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authenticate);

// GET /api/alerts
router.get('/', async (req, res) => {
    try {
        // Alerts are for VENDOR only
        if (req.user.role !== 'VENDOR') {
            return res.json({ total: 0, unread: 0, page: 1, data: [] });
        }

        const { type, is_read, product_id, page = 1, limit = 50 } = req.query;
        const skip  = (Number(page) - 1) * Number(limit);
        const query = { vendor_id: req.user._id };

        if (type)       query.type       = type;
        if (product_id) query.product_id = product_id;
        if (is_read !== undefined && is_read !== '') {
            query.is_read = is_read === 'true';
        }

        const [rows, total, unread] = await Promise.all([
            Alert.find(query)
                .populate('product_id', 'id name sku category current_stock reorder_level')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Alert.countDocuments(query),
            Alert.countDocuments({ vendor_id: req.user._id, is_read: false })
        ]);

        res.json({ total, unread, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/alerts/read-all
router.put('/read-all', async (req, res) => {
    try {
        if (req.user.role !== 'VENDOR') return res.json({ success: true });
        await Alert.updateMany({ vendor_id: req.user._id, is_read: false }, { is_read: true });
        res.json({ success: true, message: 'All alerts marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/alerts/:id/read
router.put('/:id/read', async (req, res) => {
    try {
        const alert = await Alert.findById(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alert not found' });
        if (req.user.role === 'VENDOR' && String(alert.vendor_id) !== String(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        alert.is_read = true;
        await alert.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req, res) => {
    try {
        const alert = await Alert.findById(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alert not found' });
        if (req.user.role === 'VENDOR' && String(alert.vendor_id) !== String(req.user._id)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await alert.deleteOne();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
