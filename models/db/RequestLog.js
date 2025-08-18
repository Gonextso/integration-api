import mongoose from "mongoose";

export default mongoose.model('RequestLog', new mongoose.Schema({
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    requestId: String,
    method: String,
    url: String,
    body: String,
    headers: String,
    status: Number,
    responseTime: String,
    response: String,
    traceId: { type: String, required: true },
    transactionId: String,
    isError: Boolean,
    createdAt: { type: Date, default: Date.now },
}));