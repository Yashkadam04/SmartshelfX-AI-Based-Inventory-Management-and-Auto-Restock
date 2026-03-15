const { Product, PurchaseOrder, User } = require('../models');
const { sendPurchaseOrderEmail }       = require('./mailer');

const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const runPOCheck = async () => {
    try {
        console.log('[Scheduler] Running PO check...');

        const products = await Product.find().populate('vendor_id', 'id name email');
        let created = 0;

        for (const product of products) {
            const { _id, name, sku, current_stock, reorder_level, vendor_id } = product;
            if (!vendor_id) continue;

            const isCritical = current_stock === 0 || current_stock <= reorder_level * 0.5;
            const isHigh     = current_stock <= reorder_level;
            if (!isCritical && !isHigh) continue;

            const riskLevel = isCritical ? 'CRITICAL' : 'HIGH';

            const existing = await PurchaseOrder.findOne({
                product_id: _id,
                status: { $in: ['PENDING', 'APPROVED'] }
            });
            if (existing) continue;

            const quantity = Math.max(reorder_level * 2, 10);
            const po = await PurchaseOrder.create({
                product_id: _id, vendor_id: vendor_id._id, quantity, status: 'PENDING',
                notes: `[Scheduler] Auto-generated: ${name} (${sku}) is ${riskLevel}. Stock: ${current_stock}, Reorder: ${reorder_level}.`
            });

            console.log(`[Scheduler] ✅ PO #${po._id} created → ${name} | ${riskLevel} | vendor: ${vendor_id?.name || vendor_id._id}`);
            created++;

            if (vendor_id?.email) {
                try {
                    await sendPurchaseOrderEmail({
                        vendorEmail: vendor_id.email, vendorName: vendor_id.name,
                        productName: name, productSku: sku, quantity, orderId: po._id,
                        notes: `Stock status: ${riskLevel}. Current stock: ${current_stock} units.`
                    });
                } catch (mailErr) {
                    console.error(`[Scheduler] Email failed for PO #${po._id}:`, mailErr.message);
                }
            }
        }

        console.log(created === 0 ? '[Scheduler] No new POs needed.' : `[Scheduler] Done — ${created} new PO(s) created.`);
    } catch (err) {
        console.error('[Scheduler] Error during PO check:', err.message);
    }
};

const startPOScheduler = () => {
    console.log('[Scheduler] PO auto-check started — runs every 2 minutes.');
    runPOCheck();
    setInterval(runPOCheck, INTERVAL_MS);
};

module.exports = { startPOScheduler };