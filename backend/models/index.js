const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── User ─────────────────────────────────────────────────────────
const UserSchema = new Schema({
    name:     { type: String, required: true, maxlength: 100 },
    username: { type: String, unique: true, sparse: true, maxlength: 100 },
    email:    { type: String, required: true, unique: true, maxlength: 100 },
    password: { type: String, required: true, maxlength: 255 },
    role:     { type: String, enum: ['ADMIN', 'MANAGER', 'VENDOR'], default: 'MANAGER', required: true }
}, { timestamps: true });

// ── Product ───────────────────────────────────────────────────────
const ProductSchema = new Schema({
    name:          { type: String, required: true, maxlength: 100 },
    sku:           { type: String, required: true, unique: true, maxlength: 50 },
    category:      { type: String, required: true, maxlength: 100 },
    vendor_id:     { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reorder_level: { type: Number, required: true, default: 10 },
    current_stock: { type: Number, required: true, default: 0 },
    unit_price:    { type: Number, required: true, default: 0 },
    expiry_date:   { type: Date, default: null }
}, { timestamps: true });

// Note: sku index is already created by unique:true above — no duplicate needed
ProductSchema.index({ category: 1 });
ProductSchema.index({ vendor_id: 1 });

// ── StockTransaction ──────────────────────────────────────────────
const StockTransactionSchema = new Schema({
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity:   { type: Number, required: true },
    type:       { type: String, enum: ['IN', 'OUT'], required: true },
    timestamp:  { type: Date, default: Date.now },
    handled_by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes:      { type: String, default: null }
}, { timestamps: false });

StockTransactionSchema.index({ product_id: 1, timestamp: -1 });
StockTransactionSchema.index({ type: 1 });

// ── PurchaseOrder ─────────────────────────────────────────────────
const PurchaseOrderSchema = new Schema({
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    vendor_id:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    quantity:   { type: Number, required: true },
    status:     {
        type: String,
        enum: ['PENDING', 'APPROVED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'],
        default: 'PENDING',
        required: true
    },
    notes:      { type: String, default: null }
}, { timestamps: true });

PurchaseOrderSchema.index({ status: 1 });
PurchaseOrderSchema.index({ vendor_id: 1 });

// ── Alert ─────────────────────────────────────────────────────────
const AlertSchema = new Schema({
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    vendor_id:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type:       {
        type: String,
        enum: ['LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRY', 'RESTOCK_SUGGESTED'],
        required: true
    },
    message:    { type: String, required: true },
    is_read:    { type: Boolean, default: false }
}, { timestamps: true });

AlertSchema.index({ is_read: 1 });
AlertSchema.index({ type: 1 });
AlertSchema.index({ vendor_id: 1 });

// ── ForecastResult ────────────────────────────────────────────────
const ForecastResultSchema = new Schema({
    product_id:    { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    forecast_date: { type: Date, required: true },
    predicted_qty: { type: Number, default: 0 },
    confidence:    { type: Number, default: 0 },
    risk_level:    {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'LOW',
        required: true
    }
}, { timestamps: true });

ForecastResultSchema.index({ product_id: 1, forecast_date: 1 }, { unique: true });
ForecastResultSchema.index({ risk_level: 1 });

// ── Export all models ─────────────────────────────────────────────
const User            = mongoose.model('User',            UserSchema);
const Product         = mongoose.model('Product',         ProductSchema);
const StockTransaction = mongoose.model('StockTransaction', StockTransactionSchema);
const PurchaseOrder   = mongoose.model('PurchaseOrder',   PurchaseOrderSchema);
const Alert           = mongoose.model('Alert',           AlertSchema);
const ForecastResult  = mongoose.model('ForecastResult',  ForecastResultSchema);

module.exports = { User, Product, StockTransaction, PurchaseOrder, Alert, ForecastResult };