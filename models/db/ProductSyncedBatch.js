import mongoose from "mongoose";
import SystemCodes from "../../enums/SystemCodes.js";

export default mongoose.model('ProductSyncedBatch', new mongoose.Schema({
    request: {
        startDate: String,
        endDate: String,
        productNumberList: [String]
    },
    numbers: {
        total: Number,
        createProductTotal: Number,
        createProductSuccess: Number,
        createProductError: Number,
        createProductSkippedTotal: Number,
        createProductSkippedAlreadySynced: Number,
        createProductSkippedFailed: Number,
    },
    isErrorLogExistsForThisBatch: Boolean,
    process: { type: String, required: true, enum: Object.keys(SystemCodes.PROCESS)  },
    erp: { type: String, required: true, enum: Object.keys(SystemCodes.ERP)  },
    ecommerce: { type: String, required: true, enum: Object.keys(SystemCodes.ECOMMERCE) },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    traceId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
}));