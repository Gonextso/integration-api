import mongoose from "mongoose";
import SystemCodes from "../../enums/SystemCodes.js";

export default mongoose.model('OrderSyncBatch', new mongoose.Schema({
    request: {
        startDate: String,
        endDate: String,
        orderNumberList: [String]
    },
    successList: [String],
    failedList: [String],
    isErrorLogExistsForThisBatch: Boolean,
    totalFetchedOrderCount: Number,
    skippedFailedOrderCount: Number,
    skippedAlreadySyncedOrderCount: Number,
    cancelledOrderCount: Number,
    skippedNotSyncedCancelOrders: Number,
    process: { type: String, required: true, enum: Object.keys(SystemCodes.PROCESS)  },
    erp: { type: String, required: true, enum: Object.keys(SystemCodes.ERP)  },
    ecommerce: { type: String, required: true, enum: Object.keys(SystemCodes.ECOMMERCE) },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    traceId: { type: String, index: true, required: true },
    createdAt: { type: Date, default: Date.now },
}));