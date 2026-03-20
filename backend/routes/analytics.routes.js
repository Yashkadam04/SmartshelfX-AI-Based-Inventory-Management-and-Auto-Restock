const express = require('express');
const { Op } = require('sequelize');
const { sequelize, Product, StockTransaction, PurchaseOrder, Alert } = require('../models');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/summary', async (req, res) => {
    try {
        const totalProducts = await Product.count();

        const lowStockItems = await Product.count({
            where: {
                current_stock: { [Op.gt]: 0 },
                [Op.and]: [sequelize.literal('current_stock <= reorder_level')]
            }
        });

        const outOfStockItems = await Product.count({
            where: { current_stock: 0 }
        });

        // Only count POs that have a vendor assigned (orphaned POs excluded)
        const pendingOrders = await PurchaseOrder.count({
            where: { status: 'PENDING', vendor_id: { [Op.ne]: null } }
        });

        res.json({ totalProducts, lowStockItems, outOfStockItems, pendingOrders });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/stock-trend', async (req, res) => {
    try {
        const rows = await StockTransaction.findAll({
            attributes: [
                [sequelize.fn('DATE_FORMAT', sequelize.col('timestamp'), '%Y-%m'), 'month'],
                'type',
                [sequelize.fn('SUM', sequelize.col('quantity')), 'total']
            ],
            where: {
                timestamp: {
                    [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 6))
                }
            },
            group: [
                sequelize.fn('DATE_FORMAT', sequelize.col('timestamp'), '%Y-%m'),
                'type'
            ],
            order: [
                [sequelize.fn('DATE_FORMAT', sequelize.col('timestamp'), '%Y-%m'), 'ASC']
            ],
            raw: true
        });

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/top-restocked', async (req, res) => {
    try {
        const rows = await StockTransaction.findAll({
            attributes: [
                'product_id',
                [sequelize.fn('SUM', sequelize.col('StockTransaction.quantity')), 'total_restocked']
            ],
            where: { type: 'IN' },
            include: [{
                model: Product,
                as: 'Product',
                attributes: ['name', 'sku']
            }],
            group: ['product_id', 'Product.id'],
            order: [[sequelize.fn('SUM', sequelize.col('StockTransaction.quantity')), 'DESC']],
            limit: 10,
            raw: false
        });

        const result = rows.map(r => ({
            name: r.Product.name,
            sku: r.Product.sku,
            total_restocked: Number(r.dataValues.total_restocked)
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/category-breakdown', async (req, res) => {
    try {
        const rows = await Product.findAll({
            attributes: [
                'category',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('current_stock')), 'total_stock']
            ],
            group: ['category'],
            order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
            raw: true
        });

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/low-stock', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const products = await Product.findAll({
            where: {
                [Op.or]: [
                    { current_stock: 0 },
                    sequelize.literal('current_stock <= reorder_level')
                ]
            },
            order: [['current_stock', 'ASC']],
            limit: Number(limit)
        });

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
