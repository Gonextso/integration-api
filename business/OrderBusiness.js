import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import OrderSyncLog from "../models/db/OrderSyncLog.js";
import FailedOrder from "../models/db/FailedOrder.js";
import NebimOrderBusiness from "./nebim/OrderBusiness.js";
import ShopifyOrderBusiness from "./shopify/OrderBusiness.js";

export default class OrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    syncShopifyToNebim = async (startDate, endDate) => {        
        const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant.shopify);
        const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);
        
        const shopifyOrderList = await shopifyOrderBusiness.getOrders(startDate, endDate);

        if (!shopifyOrderList.length) return;
        
        await nebimOrderBusiness.cacheDefaults();

        const results = await nebimOrderBusiness.createOrders(shopifyOrderList);

        const orderSyncLog = new OrderSyncLog({
            request: {
                startDate: startDate,
                endDate: endDate
            },
            erp: SystemCodes.ERP.V3_INTEGRATOR,
            ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
            process: SystemCodes.PROCESS.SYNC_ORDERS,
            tenant: this.tenant._id,
            successList: results.successOrders,
            failedList: results.failedOrders.map(x => (x.ecommerceId)),
            isErrorLogExistsForThisBatch: results.failedOrders.length > 0,
            totalFetchedOrderCount: shopifyOrderList.length,
            skippedOrderCount: results.skippedFailedOrderCount
        });

        if (results.failedOrders.length) {
            for (const failedOrder of results.failedOrders) {
                const failedOrderDoc = new FailedOrder({
                    ecommerceId: failedOrder.ecommerceId,
                    ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
                    erp: SystemCodes.ERP.V3_INTEGRATOR,
                    tenant: this.tenant._id,
                    orderData: failedOrder.orderData,
                    syncBatchId: orderSyncLog._id,
                    reason: failedOrder.reason,
                    knownFailedStep: failedOrder.knownFailedStep
                });
                   
                failedOrderDoc.save();
            }
        }

        orderSyncLog.save();
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

        const results = await nebimOrderBusiness.createOrders(failedOrderList.map(x => x.orderData), true);

        const orderSyncLog = new OrderSyncLog({
            erp: SystemCodes.ERP.V3_INTEGRATOR,
            ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
            process: SystemCodes.PROCESS.SYNC_FAILED_ORDERS,
            tenant: this.tenant._id,
            successList: results.successOrders,
            failedList: results.failedOrders.map(x => (x.ecommerceId)),
            isErrorLogExistsForThisBatch: results.failedOrders.length > 0,
            totalFetchedOrderCount: failedOrderList.length,
            skippedOrderCount: results.skippedFailedOrderCount
        });

        for (const failedOrder of results.failedOrders) {
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
                        syncBatchId: orderSyncLog._id,
                        reason: failedOrder.reason,
                        knownFailedStep: failedOrder.knownFailedStep
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            )
            .exec()
        }

        orderSyncLog.save();
    }
}