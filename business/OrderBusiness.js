import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import OrderSyncBatch from "../models/db/OrderSyncBatch.js";
import FailedOrder from "../models/db/FailedOrder.js";
import NebimOrderBusiness from "./nebim/OrderBusiness.js";
import ShopifyOrderBusiness from "./shopify/OrderBusiness.js";
import SuccessOrder from "../models/db/SuccessOrder.js";

export default class OrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    syncShopifyToNebim = async (startDate, endDate) => {        
        const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
        const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);
        
        const shopifyOrderList = await shopifyOrderBusiness.getOrders(startDate, endDate);

        if (!shopifyOrderList.length) return;
        
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
            successList: craeteOrderResults.successOrders.map(x => (x.ecommerceId)),
            failedList: craeteOrderResults.failedOrders.map(x => (x.ecommerceId)),
            isErrorLogExistsForThisBatch: craeteOrderResults.failedOrders.length > 0,
            totalFetchedOrderCount: shopifyOrderList.length,
            skippedFailedOrderCount: craeteOrderResults.skippedFailedOrderCount,
            cancelledOrderCount: 0,
            skippedAlreadySyncedOrderCount: craeteOrderResults.skippedAlreadySyncedOrders
        });

        if (craeteOrderResults.failedOrders.length) {
            for (const failedOrder of craeteOrderResults.failedOrders) {
                const failedOrderDoc = new FailedOrder({
                    ecommerceId: failedOrder.ecommerceId,
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    orderData: failedOrder.orderData,
                    syncBatchId: orderSyncBatch._id,
                    reason: failedOrder.reason,
                    knownFailedStep: failedOrder.knownFailedStep
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
                    orderData: failedOrder.orderData,
                    syncBatchId: orderSyncBatch._id,
                    reason: failedOrder.reason,
                    knownFailedStep: failedOrder.knownFailedStep,
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
                    syncBatchId: orderSyncBatch._id,
                    ecommerceId: successOrder.ecommerceId,
                    lines: successOrder.lines,
                    isCancelled: successOrder.isCancelled,
                    erpId: successOrder.erpId
                });
                   
                successOrderDoc.save();
            }
        }

        orderSyncBatch.successList = [...orderSyncBatch.successList, ...cancelOrders.successOrders.map(x => (x.ecommerceId))];
        orderSyncBatch.failedList = [...orderSyncBatch.failedList, ...cancelOrders.failedOrders.map(x => (x.ecommerceId))];
        orderSyncBatch.isErrorLogExistsForThisBatch = cancelOrders.failedOrders.length > 0 || craeteOrderResults.failedOrders.length > 0;
        orderSyncBatch.cancelledOrderCount = cancelOrders.successOrders.length;
        orderSyncBatch.skippedFailedOrderCount += cancelOrders.skippedFailedOrderCount;
        orderSyncBatch.skippedAlreadySyncedOrderCount += cancelOrders.skippedAlreadySyncedOrders;
        orderSyncBatch.skippedNotSyncedCancelOrders = cancelOrders.skippedNotSyncedCancelOrders;

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
            const { ecommerceId } = log;
            if (ecommerceId && !latestErrorsByEcomId.has(ecommerceId)) {
                latestErrorsByEcomId.set(ecommerceId, log);
            }
        }
    
        return Array.from(latestErrorsByEcomId.values());
    }

    syncFailedOrders = async (erp, ecommerce, orderNumberList) => {
        const query = {
            erp,
            ecommerce,
            tenant: this.tenant._id,
            ecommerceId: { $in: orderNumberList }
        };

        const failedOrderList  = await FailedOrder.find(query);

        if (!failedOrderList.length) return;

        const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);

        const craeteOrderResults = await nebimOrderBusiness.createOrders(failedOrderList.map(x => x.orderData), true);

        const orderSyncBatch = new OrderSyncBatch({
            erp: SystemCodes.ERP.V3_INTEGRATOR,
            ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
            process: SystemCodes.PROCESS.SYNC_FAILED_ORDERS,
            tenant: this.tenant._id,
            successList: craeteOrderResults.successOrders.map(x => (x.ecommerceId)),
            failedList: craeteOrderResults.failedOrders.map(x => (x.ecommerceId)),
            isErrorLogExistsForThisBatch: craeteOrderResults.failedOrders.length > 0,
            totalFetchedOrderCount: failedOrderList.length,
            skippedOrderCount: craeteOrderResults.skippedFailedOrderCount
        });

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
                        reason: failedOrder.reason,
                        knownFailedStep: failedOrder.knownFailedStep
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
                tenant: this.tenant._id
            }).exec();
        }

        orderSyncBatch.save();
    }
}