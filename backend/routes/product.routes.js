const express  = require('express');
const multer   = require('multer');
const csv      = require('csv-parser');
const fs       = require('fs');
const path     = require('path');
const { Product, User, StockTransaction, ForecastResult, Alert, PurchaseOrder } = require('../models');
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
        ACCEPTED_EXTS.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file type "${ext}"`));
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(authenticate);

// ── Column key maps (same as original) ───────────────────────────
const flat = str => String(str || '').toLowerCase().replace(/[\s_\-\.\/\\()]/g, '');
const NAME_KEYS    = ['name','productname','product','itemname','item','title','description'];
const SKU_KEYS     = ['sku','code','itemcode','productcode','barcode','partno','partnum','partnumber','productid','id','ref'];
const CATEGORY_KEYS= ['category','cat','type','group','department','dept','class'];
const STOCK_KEYS   = ['currentstock','stock','qty','quantity','onhand','available','stockqty'];
const REORDER_KEYS = ['reorderlevel','reorder','minstock','minimum','minqty','reorderpoint'];
const PRICE_KEYS   = ['unitprice','price','cost','rate','unitcost','sellingprice','mrp','amount'];
const EXPIRY_KEYS  = ['expirydate','expiry','expiration','bestbefore','expdate'];

const findValue = (row, keyList) => {
    for (const key of keyList) {
        for (const rk of Object.keys(row)) {
            if (flat(rk) === key) {
                const val = String(row[rk] || '').trim();
                if (val && val !== 'undefined' && val !== 'null') return val;
            }
        }
    }
    return undefined;
};

const parseRows = rawRows => rawRows.reduce((acc, row) => {
    const name     = findValue(row, NAME_KEYS);
    const sku      = findValue(row, SKU_KEYS);
    const category = findValue(row, CATEGORY_KEYS);
    if (!name || !sku || !category) return acc;
    const stockVal  = findValue(row, STOCK_KEYS);
    const reorderVal= findValue(row, REORDER_KEYS);
    const priceVal  = findValue(row, PRICE_KEYS);
    const expiryVal = findValue(row, EXPIRY_KEYS);
    acc.push({
        name: name.trim(), sku: sku.trim(), category: category.trim(), vendor_id: null,
        current_stock: stockVal  ? Math.max(0, parseInt(stockVal) || 0)   : 0,
        reorder_level: reorderVal? Math.max(1, parseInt(reorderVal) || 10) : 10,
        unit_price:    priceVal  ? Math.max(0, parseFloat(priceVal) || 0)  : 0,
        expiry_date:   expiryVal || null
    });
    return acc;
}, []);

const readCSV = (filePath, sep = ',') => new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv({ separator: sep, mapHeaders: ({ header }) => header.trim() }))
        .on('data', row => rows.push(row))
        .on('end',  () => resolve(rows))
        .on('error', err => reject(err));
});

const readExcel = filePath => {
    const XLSX = require('xlsx');
    const wb   = XLSX.readFile(filePath, { cellDates: true });
    const sheet= wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
};

const parseFile = async (filePath, ext) => {
    if (['.xlsx','.xls','.ods'].includes(ext)) return readExcel(filePath);
    if (ext === '.tsv') return readCSV(filePath, '\t');
    if (ext === '.txt') {
        const sample = fs.readFileSync(filePath, 'utf8').slice(0, 500);
        return readCSV(filePath, sample.includes('\t') ? '\t' : ',');
    }
    return readCSV(filePath, ',');
};

// GET /api/products
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, category, vendor_id, status } = req.query;
        const skip  = (Number(page) - 1) * Number(limit);
        const query = {};

        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { sku:  { $regex: search, $options: 'i' } }
        ];
        if (category)  query.category  = category;
        if (vendor_id) query.vendor_id = vendor_id;

        // Status filter using aggregation for computed fields
        let products, total;
        if (status) {
            let exprFilter;
            if (status === 'out')           exprFilter = { $eq: ['$current_stock', 0] };
            else if (status === 'critical') exprFilter = { $and: [{ $gt: ['$current_stock', 0] }, { $lte: ['$current_stock', { $multiply: ['$reorder_level', 0.5] }] }] };
            else if (status === 'low')      exprFilter = { $and: [{ $gt: ['$current_stock', { $multiply: ['$reorder_level', 0.5] }] }, { $lte: ['$current_stock', '$reorder_level'] }] };
            else if (status === 'in_stock') exprFilter = { $gt: ['$current_stock', '$reorder_level'] };

            const pipeline = [
                { $match: query },
                { $match: { $expr: exprFilter } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'vendor_id',
                        foreignField: '_id',
                        as: 'vendor_id'
                    }
                },
                {
                    $unwind: {
                        path: '$vendor_id',
                        preserveNullAndEmptyArrays: true
                    }
                },
                { $sort: { updatedAt: -1 } },
                {
                    $facet: {
                        data:  [{ $skip: skip }, { $limit: Number(limit) }],
                        count: [{ $count: 'total' }]
                    }
                }
            ];
            const [result] = await Product.aggregate(pipeline);
            products = result.data;
            total    = result.count[0]?.total || 0;
        } else {
            [products, total] = await Promise.all([
                Product.find(query)
                    .populate('vendor_id', 'id name email')
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(Number(limit)),
                Product.countDocuments(query)
            ]);
        }

        res.json({ total, page: Number(page), data: products });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/categories
router.get('/categories', async (req, res) => {
    try {
        const cats = await Product.distinct('category');
        res.json(cats.filter(Boolean));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('vendor_id', 'id name email');
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper — sanitize vendor_id: treat "undefined", "null", "", null, undefined all as null
const sanitizeVendorId = (v) => {
    if (!v || v === 'undefined' || v === 'null' || v === 'false') return null;
    return v;
};

// POST /api/products
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const { name, sku, category, vendor_id, reorder_level, current_stock, unit_price, expiry_date } = req.body;
        if (!name || !sku || !category) return res.status(400).json({ error: 'name, sku and category are required' });

        const existing = await Product.findOne({ sku });
        if (existing) return res.status(409).json({ error: `SKU "${sku}" already exists` });

        const product = await Product.create({
            name, sku, category,
            vendor_id:     sanitizeVendorId(vendor_id),
            reorder_level: reorder_level || 10,
            current_stock: current_stock || 0,
            unit_price:    unit_price    || 0,
            expiry_date:   expiry_date   || null
        });
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/products/:id
router.put('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const { name, sku, category, vendor_id, reorder_level, current_stock, unit_price, expiry_date } = req.body;

        if (sku && sku !== product.sku) {
            const existing = await Product.findOne({ sku });
            if (existing) return res.status(409).json({ error: `SKU "${sku}" already in use` });
        }

        Object.assign(product, {
            name:          name          ?? product.name,
            sku:           sku           ?? product.sku,
            category:      category      ?? product.category,
            vendor_id:     sanitizeVendorId(vendor_id) ?? product.vendor_id,
            reorder_level: reorder_level ?? product.reorder_level,
            current_stock: current_stock ?? product.current_stock,
            unit_price:    unit_price    ?? product.unit_price,
            expiry_date:   expiry_date   ?? product.expiry_date
        });
        await product.save();

        if (product.current_stock <= product.reorder_level) {
            await checkAndCreatePO(product);
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/products/:id
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        await Promise.all([
            StockTransaction.deleteMany({ product_id: product._id }),
            ForecastResult.deleteMany({ product_id: product._id }),
            Alert.deleteMany({ product_id: product._id }),
            PurchaseOrder.deleteMany({ product_id: product._id }),
            product.deleteOne()
        ]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/products/preview-sheet
router.post('/preview-sheet', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    const ext      = path.extname(req.file.originalname).toLowerCase();
    try {
        const rawRows = await parseFile(filePath, ext);
        const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
        const preview = parseRows(rawRows.slice(0, 3));
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.json({ detected_columns: headers, total_rows: rawRows.length, preview_rows: preview, parseable: preview.length > 0 });
    } catch (err) {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/products/import-sheet
router.post('/import-sheet', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    const ext      = path.extname(req.file.originalname).toLowerCase();
    try {
        const rawRows   = await parseFile(filePath, ext);
        if (rawRows.length === 0) {
            fs.existsSync(filePath) && fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'File is empty or could not be read' });
        }
        const validRows = parseRows(rawRows);
        if (validRows.length === 0) {
            fs.existsSync(filePath) && fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'No valid rows found', detected_columns: Object.keys(rawRows[0]), total_rows_found: rawRows.length });
        }
        // Bulk insert — skip duplicates via ordered: false
        let imported = 0;
        try {
            const result = await Product.insertMany(validRows, { ordered: false });
            imported = result.length;
        } catch (bulkErr) {
            // count successful inserts even on partial duplicate error
            imported = bulkErr.result?.nInserted || 0;
        }
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.json({ success: true, imported, skipped: validRows.length - imported, total: validRows.length, message: `Successfully imported ${imported} of ${validRows.length} products` });
    } catch (err) {
        fs.existsSync(filePath) && fs.unlinkSync(filePath);
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

module.exports = router;
