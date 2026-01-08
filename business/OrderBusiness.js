import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import OrderSyncBatch from "../models/db/postgres/OrderSyncBatch.js";
import FailedOrder from "../models/db/postgres/FailedOrder.js";
import NebimOrderBusiness from "./nebim/OrderBusiness.js";
import ShopifyOrderBusiness from "./shopify/OrderBusiness.js";
import SuccessOrder from "../models/db/postgres/SuccessOrder.js";
import RequestLog from "../models/db/postgres/RequestLog.js";
import SyncQueue from "../queue/SyncQueue.js";

export default class OrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.syncQueue = new SyncQueue();
    }

    syncShopifyToNebim = async (startDate, endDate) => {
        try {
            this.logger.info(`Sync order Shopify to Nebim started for ${startDate} to ${endDate}`);
            
            const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
            const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);

            const shopifyOrderList = await shopifyOrderBusiness.getOrders(startDate, endDate);

            if (!shopifyOrderList || (shopifyOrderList && !shopifyOrderList.length)) return;

            await nebimOrderBusiness.cacheDefaults();

            // Create batch first
            const orderSyncBatch = await OrderSyncBatch.create({
                request: {
                    startDate: startDate,
                    endDate: endDate
                },
                process: SystemCodes.PROCESS.SYNC_ORDERS,
                tenant: this.tenant.id,
                traceId: this.traceId,
                isErrorLogExistsForThisBatch: false,
                numbers: {
                    total: shopifyOrderList.length,
                    createOrderTotal: shopifyOrderList.filter(x => !x.is_cancelled).length,
                    createOrderSuccess: 0,
                    createOrderError: 0,
                    createOrderSkippedTotal: 0,
                    createOrderSkippedAlreadySynced: 0,
                    createOrderSkippedFailed: 0,
                    cancelOrderTotal: shopifyOrderList.filter(x => x.is_cancelled).length,
                    cancelOrderSuccess: 0,
                    cancelOrderError: 0,
                    cancelOrderSkippedTotal: 0,
                    cancelOrderSkippedAlreadySynced: 0,
                    cancelOrderSkippedFailed: 0,
                    cancelOrderSkippedNotFound: 0
                }
            });

            // Separate create and cancel orders
            const createOrders = shopifyOrderList.filter(x => !x.is_cancelled);
            const cancelOrders = shopifyOrderList.filter(x => x.is_cancelled);

            // Add create order jobs to queue with batchId (only if not already in queue)
            if (createOrders.length > 0) {
                const added = await this.syncQueue.addOrderBatch(this.tenant, createOrders, 'create', orderSyncBatch.id);
                const addedCount = Array.isArray(added) ? added.filter(j => j !== null).length : (added ? 1 : 0);
                this.logger.info(`Added ${addedCount}/${createOrders.length} create order jobs to queue (${createOrders.length - addedCount} already in queue)`);
            }

            // Add cancel order jobs to queue with batchId (only if not already in queue)
            if (cancelOrders.length > 0) {
                const added = await this.syncQueue.addOrderBatch(this.tenant, cancelOrders, 'cancel', orderSyncBatch.id);
                const addedCount = Array.isArray(added) ? added.filter(j => j !== null).length : (added ? 1 : 0);
                this.logger.info(`Added ${addedCount}/${cancelOrders.length} cancel order jobs to queue (${cancelOrders.length - addedCount} already in queue)`);
            }

            // Jobs will be processed by workers asynchronously
            // Batch will be updated by BatchTracker as jobs complete
        } catch (error) {
            const syncError = new Error(`Error syncing Shopify to Nebim for ${startDate} to ${endDate}`);
            if (error instanceof Error) {
                syncError.stack = error.stack;
                syncError.cause = error;
            }
            this.logger.error(syncError);
        } finally {
            this.logger.info(`Sync order Shopify to Nebim finished for ${startDate} to ${endDate}`);
        }
    }

    getSyncFailedOrders = async (erp, ecommerce) => {
        try {
            this.logger.info(`Get Sync failed orders started for ${erp} and ${ecommerce}`);
            
            const query = {
                tenant: this.tenant.id
            };

            const failedOrdersList = await FailedOrder.find(query);

            const latestErrorsByEcomId = new Map();

            for (const log of failedOrdersList) {
                const { ecommerceId, traceId } = log;
                if (ecommerceId && !latestErrorsByEcomId.has(ecommerceId)) {
                    const requestLogs = await RequestLog.find({ 
                        tenant: this.tenant.id, 
                        traceId,
                    });
                    
                    // Filter by transactionId containing ecommerceId
                    const requestLogBody = requestLogs.find(log => 
                        log.transactionId && log.transactionId.toLowerCase().includes(ecommerceId.toLowerCase())
                    );

                    let requestBodyBeautified = "", responseBodyBeautified = "";
                    if (requestLogBody?.isError) {
                        if (requestLogBody?.body) {
                            if (typeof requestLogBody.body === "string") {
                                try {
                                    requestBodyBeautified = JSON.stringify(JSON.parse(requestLogBody.body), null, 2);
                                } catch (err) {
                                    requestBodyBeautified = requestLogBody.body;
                                }
                            } else {
                                requestBodyBeautified = JSON.stringify(requestLogBody.body, null, 2);
                            }
                        }

                        if (requestLogBody?.response) {
                            try {
                                responseBodyBeautified = JSON.stringify(JSON.parse(requestLogBody.response), null, 2);
                            } catch (err) {
                                responseBodyBeautified = requestLogBody.response;
                            }
                        }
                    }

                    const reasonDetail = requestLogBody?.isError ? {
                        request: requestBodyBeautified,
                        response: responseBodyBeautified
                    } : null;

                    const returnResult = {
                        ...log,
                        reasonDetail
                    } 


                    latestErrorsByEcomId.set(ecommerceId, returnResult);
                }
            }

            return Array.from(latestErrorsByEcomId.values());
        } catch (error) {
            const syncError = new Error(`Error getting sync failed orders for ${erp} and ${ecommerce}`);
            if (error instanceof Error) {
                syncError.stack = error.stack;
                syncError.cause = error;
            }
            this.logger.error(syncError);
            return [];
        } finally {
            this.logger.info(`Get sync failed orders finished for ${erp} and ${ecommerce}`);
        }
    }

    syncFailedOrders = async (erp, ecommerce, orderNumberList) => { //TODO: include cancels
        try {
            this.logger.info(`Sync failed orders started for ${erp}, ${ecommerce} with ${orderNumberList.length} orders`);
            
            const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);
            const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
            const orderMetadataMapping = [];
            const allFailedOrders = await FailedOrder.find({
                tenant: this.tenant.id,
                isCancelled: false
            });
            const failedOrderList = allFailedOrders.filter(o => orderNumberList.includes(o.shopifyOrderId || o.ecommerceId));

            const orderSyncBatch = await OrderSyncBatch.create({
                request: {
                    orderNumberList: orderNumberList
                },
                process: SystemCodes.PROCESS.SYNC_FAILED_ORDERS,
                tenant: this.tenant.id,
                traceId: this.traceId,
                isErrorLogExistsForThisBatch: false,
                numbers: {
                    total: 0,
                    createOrderTotal: 0,
                    createOrderSuccess: 0,
                    createOrderError: 0,
                    createOrderSkippedTotal: 0,
                    createOrderSkippedAlreadySynced: 0,
                    createOrderSkippedFailed: 0,
                    cancelOrderTotal: 0,
                    cancelOrderSuccess: 0,
                    cancelOrderError: 0,
                    cancelOrderSkippedTotal: 0,
                    cancelOrderSkippedAlreadySynced: 0,
                    cancelOrderSkippedFailed: 0,
                    cancelOrderSkippedNotFound: 0,
                }
            });

            if (failedOrderList.length) {
                this.logger.info(`${failedOrderList.length} failed orders found, sync started`);

                const orderList = await shopifyOrderBusiness.getOrdersByIds(failedOrderList.map(x => x.ecommerceId.split('.')[1]))
                
                const filteredCount = failedOrderList.length - orderList.length;
                if (filteredCount > 0) {
                    this.logger.info(`${filteredCount} failed orders filtered out (already have gonextso_nebim_app.order_id metafield)`);
                }
                
                const craeteOrderResults = await nebimOrderBusiness.createOrders(orderList, true);

                for (const failedOrder of craeteOrderResults.failedOrders) {
                    await FailedOrder.updateOne(
                        {
                            shopifyOrderId: failedOrder.ecommerceId,
                            tenant: this.tenant.id
                        },
                        {
                            syncBatchId: orderSyncBatch.id,
                            traceId: this.traceId,
                            reason: failedOrder.reason,
                            process: failedOrder.process
                        },
                        { upsert: true }
                    );
                }

                if (craeteOrderResults.successOrders.length) {
                    for (const successOrder of craeteOrderResults.successOrders) {
                        await SuccessOrder.create({
                            tenant: this.tenant.id,
                            syncBatchId: orderSyncBatch.id,
                            traceId: this.traceId,
                            shopifyOrderId: successOrder.ecommerceId,
                            nebimOrderId: successOrder.erpId,
                            lines: successOrder.lines,
                            isCancelled: successOrder.isCancelled
                        });
                    }
                }

                for (const successOrder of craeteOrderResults.successOrders) {
                    orderMetadataMapping.push({
                        ecommerceId: successOrder.ecommerceId.split('.')[1],
                        erpId: successOrder.erpId
                    });

                    await FailedOrder.deleteOne({
                        shopifyOrderId: successOrder.ecommerceId,
                        tenant: this.tenant.id,
                        isCancelled: false
                    });
                }

                if (orderMetadataMapping.length) { //TODO: there is 2 for loop for craeteOrderResults.successOrders merge them
                    await shopifyOrderBusiness.updateErpMetadataForOrders(orderMetadataMapping);
                    //TODO: handle errors happened and updateErpMetadataForOrders 
                }

                orderSyncBatch.successList = craeteOrderResults.successOrders.map(x => (x.ecommerceId));
                orderSyncBatch.failedList = craeteOrderResults.failedOrders.map(x => (x.ecommerceId));
                orderSyncBatch.isErrorLogExistsForThisBatch = craeteOrderResults.failedOrders.length > 0;
                orderSyncBatch.totalFetchedOrderCount = failedOrderList.length;
                orderSyncBatch.skippedFailedOrderCount = craeteOrderResults.skippedFailedOrderCount;
                orderSyncBatch.cancelledOrderCount = 0;
                orderSyncBatch.skippedAlreadySyncedOrderCount = craeteOrderResults.skippedAlreadySyncedOrders;
            } else {
                this.logger.info(`No failed orders found`);
            }

            // Get all failed cancel orders for tenant, then filter by orderNumberList
            const allFailedCancelOrders = await FailedOrder.find({
                tenant: this.tenant.id,
                isCancelled: true
            });
            const failedCancelOrderList = allFailedCancelOrders.filter(o => 
                orderNumberList.includes(o.shopifyOrderId || o.ecommerceId)
            );

            if (failedCancelOrderList.length) {
                this.logger.info(`${failedCancelOrderList.length} failed cancel orders found, sync started`);

                const cancelOrderList = await shopifyOrderBusiness.getOrdersByIds(failedCancelOrderList.map(x => x.ecommerceId.split('.')[1]))
                
                // Filter out orders that already have gonextso_nebim_app.order_id metafield
                const filteredCancelCount = failedCancelOrderList.length - cancelOrderList.length;
                if (filteredCancelCount > 0) {
                    this.logger.info(`${filteredCancelCount} failed cancel orders filtered out (already have gonextso_nebim_app.order_id metafield)`);
                }
                
                const cancelOrderResults = await nebimOrderBusiness.cancelOrders(cancelOrderList, true);

                for (const failedOrder of cancelOrderResults.failedOrders) {
                    await FailedOrder.updateOne(
                        {
                            shopifyOrderId: failedOrder.ecommerceId,
                            tenant: this.tenant.id
                        },
                        {
                            syncBatchId: orderSyncBatch.id,
                            traceId: this.traceId,
                            reason: failedOrder.reason,
                            process: failedOrder.process
                        },
                        { upsert: true }
                    );
                }

                if (cancelOrderResults.successOrders.length) {
                    for (const successOrder of cancelOrderResults.successOrders) {
                        await SuccessOrder.create({
                            tenant: this.tenant.id,
                            syncBatchId: orderSyncBatch.id,
                            traceId: this.traceId,
                            shopifyOrderId: successOrder.ecommerceId,
                            nebimOrderId: successOrder.erpId,
                            lines: successOrder.lines,
                            isCancelled: successOrder.isCancelled
                        });
                    }
                }

                for (const successOrder of cancelOrderResults.successOrders) {
                    await FailedOrder.deleteOne({
                        shopifyOrderId: successOrder.ecommerceId,
                        tenant: this.tenant.id,
                        isCancelled: true
                    });
                }

                orderSyncBatch.successList = [...orderSyncBatch.successList, ...cancelOrderResults.successOrders.map(x => (x.ecommerceId))];
                orderSyncBatch.failedList = [...orderSyncBatch.failedList, ...cancelOrderResults.failedOrders.map(x => (x.ecommerceId))];
                orderSyncBatch.isErrorLogExistsForThisBatch = cancelOrderResults.failedOrders.length > 0 || orderSyncBatch.isErrorLogExistsForThisBatch;
                orderSyncBatch.totalFetchedOrderCount += failedCancelOrderList.length;
                orderSyncBatch.skippedFailedOrderCount += cancelOrderResults.skippedFailedOrderCount;
                orderSyncBatch.cancelledOrderCount = cancelOrderResults.successOrders.length;
                orderSyncBatch.skippedAlreadySyncedOrderCount += cancelOrderResults.skippedAlreadySyncedOrders;
            } else {
                this.logger.info(`No failed cancel orders found`);
            }

            await OrderSyncBatch.updateOne(
                { id: orderSyncBatch.id },
                orderSyncBatch
            );
        } catch (error) {
            const syncError = new Error(`Error syncing failed orders for ${erp}, ${ecommerce}`);
            if (error instanceof Error) {
                syncError.stack = error.stack;
                syncError.cause = error;
            }
            this.logger.error(syncError);
        } finally {
            this.logger.info(`Sync failed orders finished for ${erp}, ${ecommerce}`);
        }
    }

    syncOrderStatus = async (startDate) => {
        try {
            this.logger.info(`Sync order status started for ${startDate}`);

            const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
            const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);

            const orderStatusList = await nebimOrderBusiness.getOrderStatus(startDate);
            
            const orderStatusCount = orderStatusList ? Object.keys(orderStatusList).length : 0;
            this.logger.info(`Sync order status: Found ${orderStatusCount} orders with status from Nebim for ${startDate}`);

            if (orderStatusCount === 0) {
                this.logger.info(`Sync order status: No orders found from Nebim, skipping Shopify update`);
                return;
            }

            const updateResults = await shopifyOrderBusiness.updateOrderFullfillmentStatus(orderStatusList);
            
            // Log summary statistics
            const totalProcessed = updateResults.length;
            const successful = updateResults.filter(r => r.success).length;
            const failed = updateResults.filter(r => !r.success).length;
            
            this.logger.info(`Sync order status summary for ${startDate}: Total processed: ${totalProcessed}, Successful: ${successful}, Failed: ${failed}`);
        } catch (error) {
            const syncError = new Error(`Error syncing order status for ${startDate}`);
            if (error instanceof Error) {
                syncError.stack = error.stack;
                syncError.cause = error;
            }
            this.logger.error(syncError);
        } finally {
            this.logger.info(`Sync order status finished for ${startDate}`);
        }
        //TODO: handle sync batches
        //TODO: handle cancelled orders from erp not a big deal maybe wait for feature request
    }
}