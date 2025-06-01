import mongoose from "mongoose";
import SystemCodes from "../../enums/SystemCodes.js"

export default mongoose.model('OrderSyncLog', new mongoose.Schema({
    request: {
        startDate: String,
        endDate: String,
    },
    successList: [{
        erpId: String,
        ecommerceId: String
    }],
    failedList: [String],
    isErrorLogExistsForThisBatch: Boolean,
    totalFetchedOrderCount: Number,
    skippedOrderCount: Number,
    process: { type: String, required: true, enum: Object.keys(SystemCodes.PROCESS)  },
    erp: { type: String, required: true, enum: Object.keys(SystemCodes.ERP)  },
    ecommerce: { type: String, required: true, enum: Object.keys(SystemCodes.ECOMMERCE) },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    createdAt: { type: Date, default: Date.now },
}));