import NebimCache from "../../cache/NebimCache.js";
import CoreClass from "../../core/CoreClass.js";
import CacheFields from "../../enums/CacheFields.js";
import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js"
import SystemHelper from "../../helpers/SystemHelper.js";
import NebimCustomerBusiness from "./CustomerBusiness.js";
import NebimObjectHelper from "../../helpers/NebimObjectHelper.js";
import FailedOrder from "../../models/db/FailedOrder.js";
import SystemCodes from "../../enums/SystemCodes.js";
import SuccessOrder from "../../models/db/SuccessOrder.js";
import TokenBusiness from "../TokenBusiness.js";

export default class NebimOrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.cache = new NebimCache(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
        this.customerBusiness = new NebimCustomerBusiness(tenant);
        this.tokenBusiness = new TokenBusiness(tenant);
    }

    cacheDefaults = async (force = false) => {
        const allAddressCodes = await this.cache.get(CacheFields.NEBIM.ADDRESS_CODES);

        if (allAddressCodes && allAddressCodes.length && force) {
            await this.cache.delete(CacheFields.NEBIM.ADDRESS_CODES);
        }

        if (!allAddressCodes || (allAddressCodes && !allAddressCodes.length)) {
            await this.cache.set(CacheFields.NEBIM.ADDRESS_CODES, await this.api.runProc(this.tenant.nebim.procNames.defaults.addressCodes));
        }
    }

    createOrders = async (orderList, dontSkipFailedOrders = false) => {
        const promises = [];
        let skippedFailedOrderCount = 0;
        let skippedAlreadySyncedOrders = 0;

        for (const order of orderList.filter(x => !x.is_cancelled)) {
            const isFailedOrderExists = Boolean(await FailedOrder.findOne({ ecommerceId: order.order_id, isCancelled: false }));

            const isOrderSynced = Boolean(
                await SuccessOrder.findOne({ ecommerceId: order.order_id, tenant: this.tenant._id, ecommerce: order.platform, erp: SystemCodes.ERP.V3_INTEGRATOR, isCancelled: false })
            );

            if (isOrderSynced) {
                skippedAlreadySyncedOrders++
                continue;
            }
            
            if (isFailedOrderExists && !dontSkipFailedOrders) {
                skippedFailedOrderCount++
                continue;
            }
            

            const transaction = `${CacheFields.SYSTEM.SYNC_ORDER_LOCK}:${order.order_id}`;
            let customer = {};

            promises.push(SystemHelper.createTransaction(this.tenant, transaction, async () => {
                let orderNumber = "";
                try {
                    await this.tokenBusiness.checkTenantTokenAvailability(1) //TODO: order token
                } catch (error) {
                    return {
                        ok: false,
                        reason: error.message,
                        ecommerceId: order.order_id,
                        process: SystemCodes.PROCESS.TOKEN_CHECK,
                        orderData: {
                            shopifyId: order.shopify_id
                        }
                    }
                }


                try {
                    customer = await this.customerBusiness.syncCustomerFromOrder(order);
                } catch (error) {
                    this.logger.error(new Error(`Error on transactionId:${transaction} - msg:${error.message} - stack:${error.stack}`));
    
                    return {
                        ok: false,
                        reason: error.message,
                        ecommerceId: order.order_id,
                        process: SystemCodes.PROCESS.SYNC_CUSTOMER,
                        orderData: {
                            shopifyId: order.shopify_id
                        }
                    }
                }

                try {
                    const orderResponse = await this.#createOrder(order, customer);
    
                    orderNumber = orderResponse.OrderNumber;

                    await this.tokenBusiness.useToken(1) //TODO:order token

                    return {
                        ok: true,
                        erpId: orderNumber,
                        ecommerceId: order.order_id,
                        lines: orderResponse.Lines.map(x => ({ erpLineId: x.LineID, quantity: x.Qty1, barcode: x.UsedBarcode, amount: x.LineAmount })),
                        partiallyCancelledLines: order.lines.filter(x => x.remaining_quantity).map(x => ({ barcode: x.barcode, quantity: x.remaining_quantity })),
                        isCancelled: false,
                        isPartiallyCancelled: order.lines.some(x => x.remaining_quantity)
                    }; //TODO: fix partially cancelled business. not send lines accepts as canceled needs to be considered

                } catch (error) {
                    this.logger.error(new Error(`Error on transactionId:${transaction} - msg:${error.message} - stack:${error.stack}`));

                    return {
                        ok: false,
                        orderData: {
                            shopifyId: order.shopify_id
                        },
                        reason: error.message,
                        ecommerceId: order.order_id,
                        process: SystemCodes.PROCESS.SYNC_ORDERS
                    }
                }
            }));
        }

        const settled = await Promise.allSettled(promises);

        const successOrders = settled
            .filter(r => r.status === 'fulfilled' && r.value && r.value.ok)
            .map(r => r.value);
        const failedOrders  = settled
            .filter(r => r.status === 'fulfilled' && r.value && !r.value.ok)
            .map(r => r.value);

        if (skippedFailedOrderCount) {
            this.logger.info2(`Skipped ${skippedFailedOrderCount} failed orders`);
        }

        if (skippedAlreadySyncedOrders) {
            this.logger.info2(`Skipped ${skippedAlreadySyncedOrders} already synced orders`);
        }

        return {
            skippedFailedOrderCount,
            skippedAlreadySyncedOrders,
            successOrders,
            failedOrders
        }
    }

    cancelOrders = async (orderList, dontSkipFailedOrders = false) => {
        const promises = [];
        let skippedFailedOrderCount = 0;
        let skippedAlreadySyncedOrders = 0;
        let skippedNotSyncedCancelOrders = 0;

        for (const order of orderList.filter(x => x.is_cancelled)) {
            const isFailedOrderExists = Boolean(await FailedOrder.findOne({ ecommerceId: order.order_id, isCancelled: true }));

            const createdOrder = await SuccessOrder.findOne({ ecommerceId: order.order_id, tenant: this.tenant._id, ecommerce: order.platform, erp: SystemCodes.ERP.V3_INTEGRATOR })

            if (!Boolean(createdOrder)) {
                skippedNotSyncedCancelOrders++
                continue;
            }
            
            if (createdOrder.isCancelled) {
                skippedAlreadySyncedOrders++
                continue;
            }
            
            if (isFailedOrderExists && !dontSkipFailedOrders) {
                skippedFailedOrderCount++
                continue;
            }

            const transaction = `${CacheFields.SYSTEM.SYNC_CANCEL_ORDER_LOCK}:${order.order_id}`;

            promises.push(SystemHelper.createTransaction(this.tenant, transaction, async () => {
                let orderNumber = "";

                try {
                    const cancelOrderResponse = await this.#cancelOrder(createdOrder); //TODO: it makes full cancel

                    orderNumber = cancelOrderResponse.OrderNumber;

                    return {
                        ok: true,
                        erpId: orderNumber,
                        ecommerceId: order.order_id,
                        isCancelled: true
                    };
    
                } catch (error) {
                    this.logger.error(new Error(`Error on transactionId:${transaction} - msg:${error.message} - stack:${error.stack}`));
    
                    return {
                        ok: false,
                        orderData: {
                            shopifyId: order.shopify_id
                        },
                        reason: error.message,
                        ecommerceId: order.order_id,
                        process: SystemCodes.PROCESS.SYNC_CANCEL_ORDERS
                    }
                }
            }));
        }

        const settled = await Promise.allSettled(promises);

        const successOrders = settled
            .filter(r => r.status === 'fulfilled' && r.value && r.value.ok)
            .map(r => r.value);
        const failedOrders  = settled
            .filter(r => r.status === 'fulfilled' && r.value && !r.value.ok)
            .map(r => r.value);

        if (skippedFailedOrderCount) {
            this.logger.info2(`Skipped ${skippedFailedOrderCount} failed cancel orders`);
        }

        if (skippedAlreadySyncedOrders) {
            this.logger.info2(`Skipped ${skippedAlreadySyncedOrders} already synced cancel orders`);
        }

        if (skippedNotSyncedCancelOrders) {
            this.logger.info2(`Skipped ${skippedNotSyncedCancelOrders} not synced cancel orders`);
        }

        return {
            skippedFailedOrderCount,
            skippedAlreadySyncedOrders,
            skippedNotSyncedCancelOrders,
            successOrders,
            failedOrders
        }
    }
        

    #createOrder = async (order, nebimCustomer) => {
        return this.api.post(NebimObjectHelper.toNebimOrder(this.tenant, order, nebimCustomer), { "IdemPotent-Key": order.order_id });
    }

    #cancelOrder = async (order, createdOrder) => {
        return this.api.post(NebimObjectHelper.toNebimCancelOrder(this.tenant, order, createdOrder), { "IdemPotent-Key": `cancel-${order.order_id}` });
    }
}