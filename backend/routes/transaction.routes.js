const express = require('express');
const { Op } = require('sequelize');
const { sequelize, StockTransaction, Product, User, Alert } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { checkAndCreatePO } = require('../utils/alertHelper');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, type, product_id, from, to } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const where = {};
        if (type) where.type = type;
        if (product_id) where.product_id = Number(product_id);

        if (from || to) {
            where.timestamp = {};
            if (from) where.timestamp[Op.gte] = new Date(from);
            if (to) where.timestamp[Op.lte] = new Date(to);
        }

        const { count, rows } = await StockTransaction.findAndCountAll({
            where,
            include: [
                { model: Product, as: 'Product', attributes: ['id', 'name', 'sku', 'category'] },
                { model: User, as: 'handler', attributes: ['id', 'name'] }
            ],
            order: [['timestamp', 'DESC']],
            limit: Number(limit),
            offset
        });

        res.json({ total: count, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { product_id, quantity, type, notes, timestamp } = req.body;

        if (!product_id || !quantity || !type) {
            await t.rollback();
            return res.status(400).json({ error: 'product_id, quantity and type are required' });
        }

        if (!['IN', 'OUT'].includes(type)) {
            await t.rollback();
            return res.status(400).json({ error: 'type must be IN or OUT' });
        }

        if (Number(quantity) <= 0) {
            await t.rollback();
            return res.status(400).json({ error: 'quantity must be greater than 0' });
        }

        const product = await Product.findByPk(product_id, { lock: t.LOCK.UPDATE, transaction: t });
        if (!product) {
            await t.rollback();
            return res.status(404).json({ error: 'Product not found' });
        }

        if (type === 'OUT' && product.current_stock < Number(quantity)) {
            await t.rollback();
            return res.status(400).json({
                error: 'Insufficient stock',
                available: product.current_stock,
                requested: Number(quantity)
            });
        }

        const newStock = type === 'IN'
            ? product.current_stock + Number(quantity)
            : product.current_stock - Number(quantity);

        await product.update({ current_stock: newStock }, { transaction: t });

        const tx = await StockTransaction.create({
            product_id: Number(product_id),
            quantity: Number(quantity),
            type,
            handled_by: req.user.id,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            notes: notes || null
        }, { transaction: t });

        await t.commit();

        await product.reload();
        // Auto-create alert + PO whenever stock drops to/below reorder level
        if (type === 'OUT' && newStock <= product.reorder_level) {
            await checkAndCreatePO(product);
        }

        res.status(201).json({
            transaction: tx,
            updatedStock: newStock
        });
    } catch (err) {
        await t.rollback();
        res.status(500).json({ error: err.message });
    }
});

router.get('/product/:product_id', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const product = await Product.findByPk(req.params.product_id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const { count, rows } = await StockTransaction.findAndCountAll({
            where: { product_id: req.params.product_id },
            include: [{ model: User, as: 'handler', attributes: ['id', 'name'] }],
            order: [['timestamp', 'DESC']],
            limit: Number(limit),
            offset
        });

        res.json({ total: count, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
