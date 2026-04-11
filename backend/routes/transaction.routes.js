const express = require('express');
const { StockTransaction, Product, User } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { checkAndCreatePO } = require('../utils/alertHelper');

const router = express.Router();
router.use(authenticate);

// GET /api/transactions
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, type, product_id, from, to } = req.query;
        const skip  = (Number(page) - 1) * Number(limit);
        const query = {};

        if (type)       query.type       = type;
        if (product_id) query.product_id = product_id;
        if (from || to) {
            query.timestamp = {};
            if (from) query.timestamp.$gte = new Date(from);
            if (to)   query.timestamp.$lte = new Date(to);
        }

        const [rows, total] = await Promise.all([
            StockTransaction.find(query)
                .populate('product_id', 'id name sku category')
                .populate('handled_by', 'id name')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(Number(limit)),
            StockTransaction.countDocuments(query)
        ]);

        res.json({ total, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/transactions
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const { product_id, quantity, type, notes, timestamp } = req.body;

        if (!product_id || !quantity || !type) {
            return res.status(400).json({ error: 'product_id, quantity and type are required' });
        }
        if (!['IN', 'OUT'].includes(type)) {
            return res.status(400).json({ error: 'type must be IN or OUT' });
        }
        if (Number(quantity) <= 0) {
            return res.status(400).json({ error: 'quantity must be greater than 0' });
        }

        const product = await Product.findById(product_id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (type === 'OUT' && product.current_stock < Number(quantity)) {
            return res.status(400).json({
                error: 'Insufficient stock',
                available: product.current_stock,
                requested: Number(quantity)
            });
        }

        const newStock = type === 'IN'
            ? product.current_stock + Number(quantity)
            : product.current_stock - Number(quantity);

        // Update stock directly
        await Product.findByIdAndUpdate(product_id, { current_stock: newStock });

        // Create transaction record
        const tx = await StockTransaction.create({
            product_id,
            quantity: Number(quantity),
            type,
            handled_by: req.user._id,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            notes: notes || null
        });

        // Auto-create alert + PO if stock drops to/below reorder level
        if (type === 'OUT' && newStock <= product.reorder_level) {
            product.current_stock = newStock;
            await checkAndCreatePO(product);
        }

        res.status(201).json({ transaction: tx, updatedStock: newStock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/transactions/product/:product_id
router.get('/product/:product_id', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const product = await Product.findById(req.params.product_id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const [rows, total] = await Promise.all([
            StockTransaction.find({ product_id: req.params.product_id })
                .populate('handled_by', 'id name')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(Number(limit)),
            StockTransaction.countDocuments({ product_id: req.params.product_id })
        ]);

        res.json({ total, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;