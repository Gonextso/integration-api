import mongoose from "mongoose";
import SystemCodes from "../../enums/SystemCodes.js";

const syncedBarcodeSchema = new mongoose.Schema({
    barcode: String,
    productId: { type: String, default: null },
    variantId: { type: String, default: null },
    erp: { type: String, required: true, enum: Object.keys(SystemCodes.ERP) },
    ecommerce: { type: String, required: true, enum: Object.keys(SystemCodes.ECOMMERCE) },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    syncedAt: { type: Date, default: Date.now }
});

syncedBarcodeSchema.index({ barcode: 1, tenant: 1, erp: 1, ecommerce: 1 }, { unique: true });

export default mongoose.model('SyncedBarcode', syncedBarcodeSchema);