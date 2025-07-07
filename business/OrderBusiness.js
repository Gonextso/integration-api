import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import OrderSyncBatch from "../models/db/OrderSyncBatch.js";
import FailedOrder from "../models/db/FailedOrder.js";
import NebimOrderBusiness from "./nebim/OrderBusiness.js";
import ShopifyOrderBusiness from "./shopify/OrderBusiness.js";
import SuccessOrder from "../models/db/SuccessOrder.js";
import RequestLog from "../models/db/RequestLog.js";

export default class OrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    syncShopifyToNebim = async (startDate, endDate) => {        
        const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
        const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);
        
        const shopifyOrderList = await shopifyOrderBusiness.getOrders(startDate, endDate);

        if (!shopifyOrderList || (shopifyOrderList && !shopifyOrderList.length)) return;
        
        await nebimOrderBusiness.cacheDefaults();

        const craeteOrderResults = await nebimOrderBusiness.createOrders(shopifyOrderList);

        const orderSyncBatch = new OrderSyncBatch({
            request: {
                startDate: startDate,
                endDate: endDate
            },
            erp: SystemCodes.ERP.V3_INTEGRATOR,
            ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
            process: SystemCodes.PROCESS.SYNC_ORDERS,
            tenant: this.tenant._id,
            traceId: this.traceId,
            isErrorLogExistsForThisBatch: craeteOrderResults.failedOrders.length > 0,
            numbers: {
                total: shopifyOrderList.length,
                createOrderTotal: shopifyOrderList.filter(x => !x.is_cancelled).length,
                createOrderSuccess: craeteOrderResults.successOrders.length,
                createOrderError: craeteOrderResults.failedOrders.length,
                createOrderSkippedTotal: craeteOrderResults.skippedFailedOrderCount + craeteOrderResults.skippedAlreadySyncedOrders,
                createOrderSkippedAlreadySynced: craeteOrderResults.skippedAlreadySyncedOrders,
                createOrderSkippedFailed: craeteOrderResults.skippedFailedOrderCount,
                cancelOrderTotal: shopifyOrderList.filter(x => x.is_cancelled).length,
                cancelOrderSuccess: 0,
                cancelOrderError: 0,
                cancelOrderSkippedTotal: 0,
                cancelOrderSkippedAlreadySynced: 0,
                cancelOrderSkippedFailed: 0
            }
        });

        if (craeteOrderResults.failedOrders.length) {
            for (const failedOrder of craeteOrderResults.failedOrders) {
                const failedOrderDoc = new FailedOrder({
                    ecommerceId: failedOrder.ecommerceId,
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    traceId: this.traceId,
                    orderData: failedOrder.orderData,
                    syncBatchId: orderSyncBatch._id,
                    reason: failedOrder.reason,
                    process: failedOrder.process
                });
                   
                failedOrderDoc.save();
            }
        }

        if (craeteOrderResults.successOrders.length) {
            for (const successOrder of craeteOrderResults.successOrders) {

                const successOrderDoc = new SuccessOrder({
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    traceId: this.traceId,
                    syncBatchId: orderSyncBatch._id,
                    ecommerceId: successOrder.ecommerceId,
                    lines: successOrder.lines,
                    partiallyCancelledLines: successOrder.partiallyCancelledLines,
                    isCancelled: successOrder.isCancelled,
                    isPartiallyCancelled: successOrder.isPartiallyCancelled,
                    erpId: successOrder.erpId
                });
                   
                successOrderDoc.save();
            }
        }

        const cancelOrders = await nebimOrderBusiness.cancelOrders(shopifyOrderList);

        if (cancelOrders.failedOrders.length) {
            for (const failedOrder of cancelOrders.failedOrders) {
                const failedOrderDoc = new FailedOrder({
                    ecommerceId: failedOrder.ecommerceId,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    erpId: failedOrder.erpId,
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    tenant: this.tenant._id,
                    traceId: this.traceId,
                    orderData: failedOrder.orderData,
                    syncBatchId: orderSyncBatch._id,
                    reason: failedOrder.reason,
                    process: failedOrder.process,
                    isCancelled: true
                });

                failedOrderDoc.save();
            }
        }

        if (cancelOrders.successOrders.length) {
            for (const successOrder of cancelOrders.successOrders) {
                const successOrderDoc = new SuccessOrder({
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    traceId: this.traceId,
                    syncBatchId: orderSyncBatch._id,
                    ecommerceId: successOrder.ecommerceId,
                    lines: successOrder.lines,
                    isCancelled: successOrder.isCancelled,
                    erpId: successOrder.erpId
                });
                   
                successOrderDoc.save();
            }
        }

        orderSyncBatch.numbers = {
            ...orderSyncBatch.numbers,
            cancelOrderSuccess: cancelOrders.successOrders.length,
            cancelOrderError: cancelOrders.failedOrders.length,
            cancelOrderSkippedTotal: cancelOrders.skippedAlreadySyncedOrders + cancelOrders.skippedFailedOrderCount + cancelOrders.skippedNotSyncedCancelOrders,
            cancelOrderSkippedAlreadySynced: cancelOrders.skippedAlreadySyncedOrders,
            cancelOrderSkippedFailed: cancelOrders.skippedFailedOrderCount,
            cancelOrderSkippedNotFound: cancelOrders.skippedNotSyncedCancelOrders
        }

        orderSyncBatch.save();
    }

    getSyncFailedOrders = async (erp, ecommerce) => {
        const query = {
            erp,
            ecommerce,
            tenant: this.tenant._id
        };

        const failedOrdersList = await FailedOrder.find(query).sort({ syncDate: -1 });

        const latestErrorsByEcomId = new Map();
    
        for (const log of failedOrdersList) {
            const { ecommerceId, traceId } = log;
            if (ecommerceId && !latestErrorsByEcomId.has(ecommerceId)) {
                const requestLogBody = await RequestLog
                    .findOne({ traceId })
                    .sort({ createdAt: -1 })
                    .select({ body: 1, _id: 0 })
                    .lean();

                let bodyBeautified = "";
                if (requestLogBody?.body) {
                    if (typeof requestLogBody.body === "string") {
                        try {
                            bodyBeautified = JSON.stringify(JSON.parse(requestLogBody.body), null, 2);
                        } catch (err) {
                            bodyBeautified = requestLogBody.body;
                        }
                    } else {
                        bodyBeautified = JSON.stringify(requestLogBody.body, null, 2);
                    }
                }

                log.reason = 
`Reason: 

${log.reason}

Trace ID : ${traceId}
Last Request Log Body : 

${bodyBeautified}`;

                latestErrorsByEcomId.set(ecommerceId, log);
            }
        }
    
        return Array.from(latestErrorsByEcomId.values());
    }

    syncFailedOrders = async (erp, ecommerce, orderNumberList) => { //TODO: include cancels
        const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);
        const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
        const createdQuery = {
            erp,
            ecommerce,
            tenant: this.tenant._id,
            ecommerceId: { $in: orderNumberList },
            isCancelled: false
        };

        const failedOrderList  = await FailedOrder.find(createdQuery);

        const orderSyncBatch = new OrderSyncBatch({
            request: {
                orderNumberList: orderNumberList
            },
            erp: SystemCodes.ERP.V3_INTEGRATOR,
            ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
            process: SystemCodes.PROCESS.SYNC_FAILED_ORDERS,
            tenant: this.tenant._id,
            traceId: this.traceId,
            successList: [],
            failedList: [],
            isErrorLogExistsForThisBatch: 0,
            totalFetchedOrderCount: 0,
            skippedOrderCount: 0,
            skippedFailedOrderCount: 0,
            cancelledOrderCount: 0,
            skippedAlreadySyncedOrderCount: 0,
        });

        if (failedOrderList.length) {
            this.logger.info(`${failedOrderList.length} failed orders found, sync started`);

            const orderList = await shopifyOrderBusiness.getOrdersByIds(failedOrderList.map(x => x.orderData.shopifyId))
            const craeteOrderResults = await nebimOrderBusiness.createOrders(orderList, true);
    
            for (const failedOrder of craeteOrderResults.failedOrders) {
                FailedOrder.findOneAndUpdate(
                    {
                        ecommerceId: failedOrder.ecommerceId,
                        ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                        erp: SystemCodes.ERP.V3_INTEGRATOR,
                        tenant: this.tenant._id
                    },
                    {
                        $set: {
                            orderData: failedOrder.orderData,
                            syncBatchId: orderSyncBatch._id,
                            traceId: this.traceId,
                            reason: failedOrder.reason,
                            process: failedOrder.process
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                )
                .exec()
            }
    
            if (craeteOrderResults.successOrders.length) {
                for (const successOrder of craeteOrderResults.successOrders) {
                    const successOrderDoc = new SuccessOrder({
                        ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                        erp: SystemCodes.ERP.V3_INTEGRATOR,
                        tenant: this.tenant._id,
                        syncBatchId: orderSyncBatch._id,
                        traceId: this.traceId,
                        ecommerceId: successOrder.ecommerceId,
                        lines: successOrder.lines,
                        isCancelled: successOrder.isCancelled,
                        erpId: successOrder.erpId
                    });
                       
                    successOrderDoc.save();
                }
            }
    
            for (const successOrder of craeteOrderResults.successOrders) {
                FailedOrder.deleteOne({
                    ecommerceId: successOrder.ecommerceId,
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    isCancelled: false
                }).exec();
            }

            orderSyncBatch.successList = craeteOrderResults.successOrders.map(x => (x.ecommerceId));
            orderSyncBatch.failedList = craeteOrderResults.failedOrders.map(x => (x.ecommerceId));
            orderSyncBatch.isErrorLogExistsForThisBatch = craeteOrderResults.failedOrders.length > 0;
            orderSyncBatch.totalFetchedOrderCount = failedOrderList.length;
            orderSyncBatch.skippedFailedOrderCount = craeteOrderResults.skippedFailedOrderCount;
            orderSyncBatch.cancelledOrderCount = 0;
            orderSyncBatch.skippedAlreadySyncedOrderCount = craeteOrderResults.skippedAlreadySyncedOrders;
        }

        const cancelQuery = {
            erp,
            ecommerce,
            tenant: this.tenant._id,
            ecommerceId: { $in: orderNumberList },
            isCancelled: true
        };

        const failedCancelOrderList  = await FailedOrder.find(cancelQuery);

        if  (failedCancelOrderList.length) {
            this.logger.info(`${failedCancelOrderList.length} failed cancel orders found, sync started`);

            const cancelOrderList = await shopifyOrderBusiness.getOrdersByIds(failedCancelOrderList.map(x => x.orderData.shopifyId))
            const cancelOrderResults = await nebimOrderBusiness.cancelOrders(cancelOrderList, true);
    
            for (const failedOrder of cancelOrderResults.failedOrders) {
                FailedOrder.findOneAndUpdate(
                    {
                        ecommerceId: failedOrder.ecommerceId,
                        ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                        erp: SystemCodes.ERP.V3_INTEGRATOR,
                        tenant: this.tenant._id
                    },
                    {
                        $set: {
                            orderData: failedOrder.orderData,
                            syncBatchId: orderSyncBatch._id,
                            traceId: this.traceId,
                            reason: failedOrder.reason,
                            process: failedOrder.process
                        }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                )
                .exec()
            }
    
            if (cancelOrderResults.successOrders.length) {
                for (const successOrder of cancelOrderResults.successOrders) {
                    const successOrderDoc = new SuccessOrder({
                        ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                        erp: SystemCodes.ERP.V3_INTEGRATOR,
                        tenant: this.tenant._id,
                        syncBatchId: orderSyncBatch._id,
                        traceId: this.traceId,
                        ecommerceId: successOrder.ecommerceId,
                        lines: successOrder.lines,
                        isCancelled: successOrder.isCancelled,
                        erpId: successOrder.erpId
                    });
                       
                    successOrderDoc.save();
                }
            }
    
            for (const successOrder of cancelOrderResults.successOrders) {
                FailedOrder.deleteOne({
                    ecommerceId: successOrder.ecommerceId,
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    isCancelled: true
                }).exec();
            }

            orderSyncBatch.successList = [...orderSyncBatch.successList, ...cancelOrderResults.successOrders.map(x => (x.ecommerceId))];
            orderSyncBatch.failedList = [...orderSyncBatch.failedList, ...cancelOrderResults.failedOrders.map(x => (x.ecommerceId))];
            orderSyncBatch.isErrorLogExistsForThisBatch = cancelOrderResults.failedOrders.length > 0 || orderSyncBatch.isErrorLogExistsForThisBatch;
            orderSyncBatch.totalFetchedOrderCount += failedCancelOrderList.length ;
            orderSyncBatch.skippedFailedOrderCount += cancelOrderResults.skippedFailedOrderCount;
            orderSyncBatch.cancelledOrderCount = cancelOrderResults.successOrders.length;
            orderSyncBatch.skippedAlreadySyncedOrderCount += cancelOrderResults.skippedAlreadySyncedOrders;
        }

        orderSyncBatch.save();
    }
}