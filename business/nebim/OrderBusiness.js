import NebimCache from "../../cache/NebimCache.js";
import CoreClass from "../../core/CoreClass.js";
import CacheFields from "../../enums/CacheFields.js";
import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js"
import SystemHelper from "../../helpers/SystemHelper.js";
import NebimCustomerBusiness from "./CustomerBusiness.js";
import NebimObjectHelper from "../../helpers/NebimObjectHelper.js";
import FailedOrder from "../../models/db/FailedOrder.js";

export default class NebimOrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.cache = new NebimCache(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
        this.customerBusiness = new NebimCustomerBusiness(tenant);
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

        for (const order of orderList) {
            const isFailedOrderExists = Boolean(await FailedOrder.findOne({ ecommerceId: order.order_id }));
            
            if (isFailedOrderExists && !dontSkipFailedOrders) {
                skippedFailedOrderCount++
                continue;
            }

            const transaction = `${CacheFields.SYSTEM.SYNC_ORDER_LOCK}:${order.order_id}`;
            let customer = {};

            promises.push(SystemHelper.createTransaction(this.tenant, transaction, async () => {
                let orderNumber = "";

                try {
                    customer = await this.customerBusiness.syncCustomerFromOrder(order);
                } catch (error) {
                    this.logger.error(new Error(`Error on transactionId:${transaction} - ${error.message}`));
    
                    return {
                        ok: false,
                        reason: error.message,
                        ecommerceId: order.order_id,
                        knownFailedStep: "sync_customer",
                        orderData: order
                    }
                }

                try {
                    const orderResponse = await this.#createOrder(order, customer);
    
                    orderNumber = orderResponse.OrderNumber;

                    return {
                        ok: true,
                        erpId: orderNumber,
                        ecommerceId: order.order_id
                    };

                } catch (error) {
                    this.logger.error(new Error(`Error on transactionId:${transaction} - ${error.message}`));
    
                    return {
                        ok: false,
                        orderData: order,
                        reason: error.message,
                        ecommerceId: order.order_id,
                        knownFailedStep: "sync_order"
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

        return {
            skippedFailedOrderCount,
            successOrders,
            failedOrders
        }
    }

    #createOrder = async (order, nebimCustomer) => {
        return this.api.post(NebimObjectHelper.toNebimOrder(this.tenant, order, nebimCustomer), { "IdemPotent-Key": order.order_id });
    }
}