const { Alert, PurchaseOrder, User } = require('../models');

const createStockAlert = async (product) => {
    const { _id, name, sku, current_stock, reorder_level, vendor_id } = product;
    if (!vendor_id) return;

    if (current_stock === 0) {
        await Alert.create({
            product_id: _id, vendor_id,
            type:    'OUT_OF_STOCK',
            message: `${name} (${sku}): completely out of stock! Immediate restock required.`,
            is_read: false
        });
    } else if (current_stock <= reorder_level) {
        await Alert.create({
            product_id: _id, vendor_id,
            type:    'LOW_STOCK',
            message: `${name} (${sku}): only ${current_stock} units left (reorder level: ${reorder_level}). Please restock soon.`,
            is_read: false
        });
    }
};

const createAutoPO = async (product) => {
    const { _id, name, sku, current_stock, reorder_level, vendor_id } = product;
    if (!vendor_id) return null;

    const isCritical = current_stock === 0 || current_stock <= reorder_level * 0.5;
    const isHigh     = current_stock <= reorder_level;
    if (!isCritical && !isHigh) return null;

    const riskLevel = isCritical ? 'CRITICAL' : 'HIGH';

    const existing = await PurchaseOrder.findOne({
        product_id: _id,
        status: { $in: ['PENDING', 'APPROVED'] }
    });
    if (existing) return null;

    const quantity = Math.max(reorder_level * 2, 10);
    const po = await PurchaseOrder.create({
        product_id: _id, vendor_id, quantity, status: 'PENDING',
        notes: `Auto-generated: ${name} (${sku}) is ${riskLevel}. Stock: ${current_stock}, Reorder level: ${reorder_level}.`
    });

    console.log(`[AutoPO] PO #${po._id} created → ${name} (${sku}) | Risk: ${riskLevel} | vendor_id: ${vendor_id}`);

    try {
        const vendor = await User.findById(vendor_id).select('name email');
        if (vendor?.email) {
            const { sendPurchaseOrderEmail } = require('./mailer');
            await sendPurchaseOrderEmail({
                vendorEmail: vendor.email, vendorName: vendor.name,
                productName: name, productSku: sku, quantity, orderId: po._id,
                notes: `Stock status: ${riskLevel}. Current stock: ${current_stock} units.`
            });
        }
    } catch (mailErr) {
        console.error(`[AutoPO] Email failed for PO #${po._id}:`, mailErr.message);
    }

    return po;
};

const checkAndCreatePO = async (product) => {
    try { await createStockAlert(product); } catch (e) { console.error('[checkAndCreatePO] Alert error:', e.message); }
    try { await createAutoPO(product);     } catch (e) { console.error('[checkAndCreatePO] PO error:', e.message); }
};

module.exports = { createStockAlert, createAutoPO, checkAndCreatePO };