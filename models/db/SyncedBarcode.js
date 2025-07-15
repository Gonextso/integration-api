import mongoose from "mongoose";
import SystemCodes from "../../enums/SystemCodes.js";

export default mongoose.model('SyncedBarcode', new mongoose.Schema({
    barcode: String,
    erp: { type: String, required: true, enum: Object.keys(SystemCodes.ERP) },
    ecommerce: { type: String, required: true, enum: Object.keys(SystemCodes.ECOMMERCE) },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    syncedAt: { type: Date, default: Date.now }
}));