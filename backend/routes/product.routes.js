const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { Product, User, sequelize, StockTransaction, ForecastResult, Alert, PurchaseOrder } = require('../models');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { checkAndCreatePO } = require('../utils/alertHelper');

const router = express.Router();

const ACCEPTED_EXTS = ['.csv', '.xlsx', '.xls', '.tsv', '.ods', '.txt'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `import_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ACCEPTED_EXTS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTS.join(', ')}`));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(authenticate);

const flat = (str) => String(str || '').toLowerCase().replace(/[\s_\-\.\/\\()]/g, '');

const NAME_KEYS = ['name', 'productname', 'product', 'itemname', 'item', 'title', 'description', 'productdescription'];
const SKU_KEYS = ['sku', 'code', 'itemcode', 'productcode', 'barcode', 'partno', 'partnum', 'partnumber', 'productid', 'id', 'ref', 'reference', 'skucode'];
const CATEGORY_KEYS = ['category', 'cat', 'type', 'group', 'department', 'dept', 'class', 'classification', 'producttype', 'productcategory'];
const STOCK_KEYS = ['currentstock', 'stock', 'qty', 'quantity', 'onhand', 'available', 'stockqty', 'stockquantity', 'inventoryqty', 'units', 'instock'];
const REORDER_KEYS = ['reorderlevel', 'reorder', 'minstock', 'minimum', 'minqty', 'reorderpoint', 'safetystock', 'reorderthreshold', 'reorderqty'];
const PRICE_KEYS = ['unitprice', 'price', 'cost', 'rate', 'unitcost', 'sellingprice', 'retailprice', 'mrp', 'amount', 'value'];
const EXPIRY_KEYS = ['expirydate', 'expiry', 'expiration', 'bestbefore', 'expdate', 'expirationdate', 'usebydate', 'sellbydate'];

const findValue = (row, keyList) => {
    const rowKeys = Object.keys(row);
    for (const key of keyList) {
        for (const rk of rowKeys) {
            if (flat(rk) === key) {
                const val = String(row[rk] || '').trim();
                if (val !== '' && val !== 'undefined' && val !== 'null') return val;
            }
        }
    }
    return undefined;
};

const AUTO_MAP = (headers) => {
    const mapping = {};
    for (const h of headers) {
        const f = flat(h);
        if (!mapping.name && NAME_KEYS.includes(f)) mapping.name = h;
        if (!mapping.sku && SKU_KEYS.includes(f)) mapping.sku = h;
        if (!mapping.category && CATEGORY_KEYS.includes(f)) mapping.category = h;
        if (!mapping.stock && STOCK_KEYS.includes(f)) mapping.current_stock = h;
        if (!mapping.reorder && REORDER_KEYS.includes(f)) mapping.reorder_level = h;
        if (!mapping.price && PRICE_KEYS.includes(f)) mapping.unit_price = h;
        if (!mapping.expiry && EXPIRY_KEYS.includes(f)) mapping.expiry_date = h;
    }
    return mapping;
};

const parseRows = (rawRows) => {
    if (!rawRows || rawRows.length === 0) return [];

    const results = [];
    for (const row of rawRows) {
        const name = findValue(row, NAME_KEYS);
        const sku = findValue(row, SKU_KEYS);
        const category = findValue(row, CATEGORY_KEYS);

        if (!name || !sku || !category) continue;

        const stockVal = findValue(row, STOCK_KEYS);
        const reorderVal = findValue(row, REORDER_KEYS);
        const priceVal = findValue(row, PRICE_KEYS);
        const expiryVal = findValue(row, EXPIRY_KEYS);

        results.push({
            name: name.trim(),
            sku: sku.trim(),
            category: category.trim(),
            vendor_id: null,
            current_stock: stockVal ? Math.max(0, parseInt(stockVal) || 0) : 0,
            reorder_level: reorderVal ? Math.max(1, parseInt(reorderVal) || 10) : 10,
            unit_price: priceVal ? Math.max(0, parseFloat(priceVal) || 0) : 0,
            expiry_date: expiryVal || null
        });
    }
    return results;
};

const readCSV = (filePath, separator = ',') => new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv({ separator, mapHeaders: ({ header }) => header.trim() }))
        .on('data', row => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', err => reject(err));
});

const readExcel = (filePath) => {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(filePath, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
};

const parseFile = async (filePath, ext) => {
    switch (ext) {
        case '.xlsx':
        case '.xls':
        case '.ods':
            return readExcel(filePath);
        case '.tsv':
            return readCSV(filePath, '\t');
        case '.txt': {
            const sample = fs.readFileSync(filePath, 'utf8').slice(0, 500);
            const sep = sample.includes('\t') ? '\t' : ',';
            return readCSV(filePath, sep);
        }
        default:
            return readCSV(filePath, ',');
    }
};

router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, category, vendor_id, status } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { sku: { [Op.like]: `%${search}%` } }
            ];
        }
        if (category) where.category = category;
        if (vendor_id) where.vendor_id = Number(vendor_id);

        // Status filter: low, critical, out, in_stock
        if (status === 'out') {
            where.current_stock = 0;
        } else if (status === 'critical') {
            where[Op.and] = [
                sequelize.literal('current_stock > 0'),
                sequelize.literal('current_stock <= reorder_level * 0.5')
            ];
        } else if (status === 'low') {
            where[Op.and] = [
                sequelize.literal('current_stock > reorder_level * 0.5'),
                sequelize.literal('current_stock <= reorder_level')
            ];
        } else if (status === 'in_stock') {
            where[Op.and] = [sequelize.literal('current_stock > reorder_level')];
        }

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [{ model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }],
            order: [['updatedAt', 'DESC']],
            limit: Number(limit),
            offset
        });
        res.json({ total: count, page: Number(page), data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const cats = await Product.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('category')), 'category']],
            raw: true
        });
        res.json(cats.map(c => c.category).filter(Boolean));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id, {
            include: [{ model: User, as: 'vendor', attributes: ['id', 'name', 'email'] }]
        });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const { name, sku, category, vendor_id, reorder_level, current_stock, unit_price, expiry_date } = req.body;
        if (!name || !sku || !category) {
            return res.status(400).json({ error: 'name, sku and category are required' });
        }
        const existing = await Product.findOne({ where: { sku } });
        if (existing) return res.status(409).json({ error: `SKU "${sku}" already exists` });
        const product = await Product.create({
            name, sku, category,
            vendor_id: vendor_id || null,
            reorder_level: reorder_level || 10,
            current_stock: current_stock || 0,
            unit_price: unit_price || 0,
            expiry_date: expiry_date || null
        });
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const { name, sku, category, vendor_id, reorder_level, current_stock, unit_price, expiry_date } = req.body;
        if (sku && sku !== product.sku) {
            const existing = await Product.findOne({ where: { sku } });
            if (existing) return res.status(409).json({ error: `SKU "${sku}" already in use` });
        }
        await product.update({
            name: name ?? product.name,
            sku: sku ?? product.sku,
            category: category ?? product.category,
            vendor_id: vendor_id ?? product.vendor_id,
            reorder_level: reorder_level ?? product.reorder_level,
            current_stock: current_stock ?? product.current_stock,
            unit_price: unit_price ?? product.unit_price,
            expiry_date: expiry_date ?? product.expiry_date
        });
        await product.reload();
        // Auto-generate PO if stock is critical/high after manual edit
        if (product.current_stock <= product.reorder_level) {
            await checkAndCreatePO(product);
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        await StockTransaction.destroy({ where: { product_id: product.id } });
        await ForecastResult.destroy({ where: { product_id: product.id } });
        await Alert.destroy({ where: { product_id: product.id } });
        await PurchaseOrder.destroy({ where: { product_id: product.id } });

        await product.destroy();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/preview-sheet', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    try {
        const rawRows = await parseFile(filePath, ext);
        const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
        const mapping = AUTO_MAP(headers);
        const preview = parseRows(rawRows.slice(0, 3));

        fs.existsSync(filePath) && fs.unlinkSync(filePath);

        res.json({
            detected_columns: headers,
            mapped_to: mapping,
            total_rows: rawRows.length,
            preview_rows: preview,
            parseable: preview.length > 0
        });
    } catch (err) {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.status(500).json({ error: err.message });
    }
});

router.post('/import-sheet', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    try {
        const rawRows = await parseFile(filePath, ext);

        if (rawRows.length === 0) {
            fs.existsSync(filePath) && fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'File is empty or could not be read' });
        }

        const detectedHeaders = Object.keys(rawRows[0]);
        const validRows = parseRows(rawRows);

        if (validRows.length === 0) {
            fs.existsSync(filePath) && fs.unlinkSync(filePath);
            return res.status(400).json({
                error: 'No valid rows found',
                detected_columns: detectedHeaders,
                total_rows_found: rawRows.length,
                hint: `Your file has ${rawRows.length} rows but none matched required columns. Detected columns: [${detectedHeaders.join(', ')}]. Need columns for: product name, SKU/code, and category.`
            });
        }

        const imported = await Product.bulkCreate(validRows, {
            ignoreDuplicates: true,
            validate: true
        });

        fs.existsSync(filePath) && fs.unlinkSync(filePath);

        res.json({
            success: true,
            imported: imported.length,
            skipped: validRows.length - imported.length,
            total: validRows.length,
            message: `Successfully imported ${imported.length} of ${validRows.length} products`
        });

    } catch (err) {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

router.post('/import-csv', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    try {
        const rawRows = await parseFile(filePath, ext);
        const validRows = parseRows(rawRows);
        if (validRows.length === 0) {
            fs.existsSync(filePath) && fs.unlinkSync(filePath);
            const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
            return res.status(400).json({
                error: 'No valid rows found',
                detected_columns: headers,
                hint: `Detected columns: [${headers.join(', ')}]. Need name/sku/category columns.`
            });
        }
        const imported = await Product.bulkCreate(validRows, { ignoreDuplicates: true, validate: true });
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.json({ success: true, imported: imported.length, skipped: validRows.length - imported.length, total: validRows.length });
    } catch (err) {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

module.exports = router;
