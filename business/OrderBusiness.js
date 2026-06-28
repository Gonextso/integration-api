import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import OrderSyncBatch from "../models/db/postgres/OrderSyncBatch.js";
import SyncBatchLog from "../models/db/postgres/SyncBatchLog.js";
import FailedOrder from "../models/db/postgres/FailedOrder.js";
import NebimOrderBusiness from "./nebim/OrderBusiness.js";
import ShopifyOrderBusiness from "./shopify/OrderBusiness.js";
import SuccessOrder from "../models/db/postgres/SuccessOrder.js";
import RequestLog from "../models/db/postgres/RequestLog.js";

export default class OrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    /**
     * Adım adım batch logu yazar. Hata fırlatmaz — log yazılamasa bile ana akış devam eder.
     */
    #logBatchStep = async (syncBatchId, level, step, message, data = undefined) => {
        try {
            await SyncBatchLog.create({ syncBatchId, level, step, message, data });
        } catch (err) {
            this.logger.warn(`SyncBatchLog yazılamadı (${step}): ${err?.message}`);
        }
    }

    syncShopifyToNebim = async (startDate, endDate) => {
        try {
            this.logger.info(`Sync order Shopify to Nebim started for ${startDate} to ${endDate}`);

            const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
            const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);
            const orderMetadataMapping = [];

            const shopifyOrderList = await shopifyOrderBusiness.getOrders(startDate, endDate);

            if (!shopifyOrderList || (shopifyOrderList && !shopifyOrderList.length)) return;

            await nebimOrderBusiness.cacheDefaults();

            const craeteOrderResults = await nebimOrderBusiness.createOrders(shopifyOrderList);

            const orderSyncBatch = await OrderSyncBatch.create({
                request: {
                    startDate: startDate,
                    endDate: endDate
                },
                process: SystemCodes.PROCESS.SYNC_ORDERS,
                tenant: this.tenant.id,
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

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'FETCH_ORDERS',
                `Shopify'dan ${shopifyOrderList.length} sipariş çekildi (${startDate} - ${endDate})`,
                { total: shopifyOrderList.length, startDate, endDate });

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'CREATE_ORDERS',
                `Nebim'e ${shopifyOrderList.filter(x => !x.is_cancelled).length} sipariş gönderildi — başarılı: ${craeteOrderResults.successOrders.length}, hatalı: ${craeteOrderResults.failedOrders.length}, atlandı: ${craeteOrderResults.skippedFailedOrderCount + craeteOrderResults.skippedAlreadySyncedOrders}`,
                {
                    success: craeteOrderResults.successOrders.length,
                    error: craeteOrderResults.failedOrders.length,
                    skippedAlreadySynced: craeteOrderResults.skippedAlreadySyncedOrders,
                    skippedFailed: craeteOrderResults.skippedFailedOrderCount,
                    failedOrderIds: craeteOrderResults.failedOrders.map(o => o.ecommerceId),
                });

            if (craeteOrderResults.failedOrders.length) {
                await this.#logBatchStep(orderSyncBatch.id, 'WARN', 'CREATE_ORDERS_ERRORS',
                    `${craeteOrderResults.failedOrders.length} sipariş Nebim'e gönderilemedi`,
                    { orders: craeteOrderResults.failedOrders.map(o => ({ id: o.ecommerceId, reason: o.reason })) });
            }

            if (craeteOrderResults.failedOrders.length) {
                for (const failedOrder of craeteOrderResults.failedOrders) {
                    await FailedOrder.create({
                        shopifyOrderId: failedOrder.ecommerceId,
                        tenant: this.tenant.id,
                        traceId: this.traceId,
                        syncBatchId: orderSyncBatch.id,
                        reason: failedOrder.reason,
                        process: failedOrder.process
                    });
                }
            }

            if (craeteOrderResults.successOrders.length) {
                for (const successOrder of craeteOrderResults.successOrders) {

                    orderMetadataMapping.push({
                        ecommerceId: successOrder.ecommerceId.split('.')[1],
                        erpId: successOrder.erpId
                    });

                    await SuccessOrder.create({
                        tenant: this.tenant.id,
                        traceId: this.traceId,
                        syncBatchId: orderSyncBatch.id,
                        shopifyOrderId: successOrder.ecommerceId,
                        nebimOrderId: successOrder.erpId,
                        lines: successOrder.lines,
                        partiallyCancelledLines: successOrder.partiallyCancelledLines,
                        isCancelled: successOrder.isCancelled,
                        isPartiallyCancelled: successOrder.isPartiallyCancelled,
                    });
                }
            }

            if (orderMetadataMapping.length) { //TODO: there is 2 for loop for craeteOrderResults.successOrders merge them
                await shopifyOrderBusiness.updateErpMetadataForOrders(orderMetadataMapping);
            } //TODO: handle errors happened and updateErpMetadataForOrders 

            const cancelOrders = await nebimOrderBusiness.cancelOrders(shopifyOrderList);

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'CANCEL_ORDERS',
                `İptal süreci — toplam: ${shopifyOrderList.filter(x => x.is_cancelled).length}, başarılı: ${cancelOrders.successOrders.length}, hatalı: ${cancelOrders.failedOrders.length}`,
                {
                    success: cancelOrders.successOrders.length,
                    error: cancelOrders.failedOrders.length,
                    skippedAlreadySynced: cancelOrders.skippedAlreadySyncedOrders,
                    skippedFailed: cancelOrders.skippedFailedOrderCount,
                    skippedNotFound: cancelOrders.skippedNotSyncedCancelOrders,
                });

            if (cancelOrders.failedOrders.length) {
                await this.#logBatchStep(orderSyncBatch.id, 'WARN', 'CANCEL_ORDERS_ERRORS',
                    `${cancelOrders.failedOrders.length} iptal siparişi gönderilemedi`,
                    { orders: cancelOrders.failedOrders.map(o => ({ id: o.ecommerceId, reason: o.reason })) });

                for (const failedOrder of cancelOrders.failedOrders) {
                    await FailedOrder.create({
                        shopifyOrderId: failedOrder.ecommerceId,
                        tenant: this.tenant.id,
                        traceId: this.traceId,
                        syncBatchId: orderSyncBatch.id,
                        reason: failedOrder.reason,
                        process: failedOrder.process,
                        isCancelled: true
                    });
                }
            }

            if (cancelOrders.successOrders.length) {
                for (const successOrder of cancelOrders.successOrders) {
                    await SuccessOrder.create({
                        tenant: this.tenant.id,
                        traceId: this.traceId,
                        syncBatchId: orderSyncBatch.id,
                        shopifyOrderId: successOrder.ecommerceId,
                        nebimOrderId: successOrder.erpId,
                        lines: successOrder.lines,
                        isCancelled: successOrder.isCancelled,
                    });
                }
            }

            await OrderSyncBatch.updateOne(
                { id: orderSyncBatch.id },
                {
                    numbers: {
                        ...orderSyncBatch.numbers,
                        cancelOrderSuccess: cancelOrders.successOrders.length,
                        cancelOrderError: cancelOrders.failedOrders.length,
                        cancelOrderSkippedTotal: cancelOrders.skippedAlreadySyncedOrders + cancelOrders.skippedFailedOrderCount + cancelOrders.skippedNotSyncedCancelOrders,
                        cancelOrderSkippedAlreadySynced: cancelOrders.skippedAlreadySyncedOrders,
                        cancelOrderSkippedFailed: cancelOrders.skippedFailedOrderCount,
                        cancelOrderSkippedNotFound: cancelOrders.skippedNotSyncedCancelOrders
                    }
                }
            );

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'COMPLETED',
                `Sync tamamlandı — toplam sipariş: ${shopifyOrderList.length}, oluşturma başarı: ${craeteOrderResults.successOrders.length}, iptal başarı: ${cancelOrders.successOrders.length}`);
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
            await nebimOrderBusiness.cacheDefaults();
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

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'START',
                `Failed order sync başlatıldı — istenen: ${orderNumberList.length} sipariş`);

            if (failedOrderList.length) {
                this.logger.info(`${failedOrderList.length} failed orders found, sync started`);
                await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'FETCH_FAILED_ORDERS',
                    `${failedOrderList.length} başarısız sipariş bulundu, ${orderNumberList.length - failedOrderList.length} atlandı (listede değil)`);

                const orderList = await shopifyOrderBusiness.getOrdersByIds(failedOrderList.map(x => x.ecommerceId.split('.')[1]))
                
                const filteredCount = failedOrderList.length - orderList.length;
                if (filteredCount > 0) {
                    this.logger.info(`${filteredCount} failed orders filtered out (already have gonextso_nebim_app.order_id metafield)`);
                    await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'FILTER_ORDERS',
                        `${filteredCount} sipariş zaten senkronize edilmiş (metafield mevcut), atlandı`);
                }

                const craeteOrderResults = await nebimOrderBusiness.createOrders(orderList, true);
                await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'CREATE_ORDERS',
                    `Nebim'e ${orderList.length} sipariş gönderildi — başarılı: ${craeteOrderResults.successOrders.length}, hatalı: ${craeteOrderResults.failedOrders.length}`,
                    {
                        success: craeteOrderResults.successOrders.length,
                        error: craeteOrderResults.failedOrders.length,
                        failedOrderIds: craeteOrderResults.failedOrders.map(o => o.ecommerceId),
                    });

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
                await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'FETCH_FAILED_ORDERS',
                    `Başarısız sipariş bulunamadı, oluşturma adımı atlandı`);
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
                await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'CANCEL_ORDERS',
                    `İptal sync — başarılı: ${cancelOrderResults.successOrders.length}, hatalı: ${cancelOrderResults.failedOrders.length}`,
                    {
                        success: cancelOrderResults.successOrders.length,
                        error: cancelOrderResults.failedOrders.length,
                        failedOrderIds: cancelOrderResults.failedOrders.map(o => o.ecommerceId),
                    });

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
                await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'FETCH_FAILED_CANCEL_ORDERS',
                    `Başarısız iptal siparişi bulunamadı, iptal adımı atlandı`);
            }

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'COMPLETED',
                `Failed order sync tamamlandı`);

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
        let orderSyncBatch = null;
        try {
            this.logger.info(`Sync order status started for ${startDate}`);

            orderSyncBatch = await OrderSyncBatch.create({
                request: { startDate },
                process: SystemCodes.PROCESS.SYNC_ORDER_STATUS,
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

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'START',
                `Order status sync başlatıldı — startDate: ${startDate}`);

            const shopifyOrderBusiness = new ShopifyOrderBusiness(this.tenant);
            const nebimOrderBusiness = new NebimOrderBusiness(this.tenant);

            const orderStatusList = await nebimOrderBusiness.getOrderStatus(startDate);
            const orderStatusCount = orderStatusList ? Object.keys(orderStatusList).length : 0;

            this.logger.info(`Sync order status: Found ${orderStatusCount} orders with status from Nebim for ${startDate}`);
            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'FETCH_STATUS',
                `Nebim'den ${orderStatusCount} sipariş statüsü çekildi`,
                { startDate, count: orderStatusCount });

            if (orderStatusCount === 0) {
                this.logger.info(`Sync order status: No orders found from Nebim, skipping Shopify update`);
                await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'COMPLETED',
                    `Nebim'de statü değişimi bulunamadı, sync atlandı`);
                return;
            }

            const updateResults = await shopifyOrderBusiness.updateOrderFullfillmentStatus(orderStatusList);

            const totalProcessed = updateResults.length;
            const successful = updateResults.filter(r => r.success).length;
            const failed = updateResults.filter(r => !r.success).length;

            this.logger.info(`Sync order status summary for ${startDate}: Total processed: ${totalProcessed}, Successful: ${successful}, Failed: ${failed}`);

            await this.#logBatchStep(
                orderSyncBatch.id,
                failed > 0 ? 'WARN' : 'INFO',
                'UPDATE_FULFILLMENT',
                `Shopify fulfillment güncellendi — toplam: ${totalProcessed}, başarılı: ${successful}, hatalı: ${failed}`,
                {
                    total: totalProcessed,
                    successful,
                    failed,
                    failedOrders: updateResults.filter(r => !r.success).map(r => ({ id: r.orderId, reason: r.error })),
                });

            await OrderSyncBatch.updateOne(
                { id: orderSyncBatch.id },
                {
                    isErrorLogExistsForThisBatch: failed > 0,
                    numbers: {
                        total: totalProcessed,
                        createOrderTotal: totalProcessed,
                        createOrderSuccess: successful,
                        createOrderError: failed,
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
                }
            );

            await this.#logBatchStep(orderSyncBatch.id, 'INFO', 'COMPLETED',
                `Order status sync tamamlandı — başarılı: ${successful}, hatalı: ${failed}`);
        } catch (error) {
            const syncError = new Error(`Error syncing order status for ${startDate}`);
            if (error instanceof Error) {
                syncError.stack = error.stack;
                syncError.cause = error;
            }
            this.logger.error(syncError);
            if (orderSyncBatch?.id) {
                await this.#logBatchStep(orderSyncBatch.id, 'ERROR', 'FAILED',
                    `Order status sync başarısız: ${error?.message ?? String(error)}`);
            }
        } finally {
            this.logger.info(`Sync order status finished for ${startDate}`);
        }
        //TODO: handle cancelled orders from erp not a big deal maybe wait for feature request
    }
}