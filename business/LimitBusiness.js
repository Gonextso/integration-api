import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import SuccessOrder from "../models/db/postgres/SuccessOrder.js";
import Tenant from "../models/db/postgres/Tenant.js";

export default class LimitBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    clearUsage = async (limitType) => {
        const oneMonthAgo = new Date();
        limitType = limitType.toUpperCase();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // Get all orders for tenant, then filter by date and cleared status
        const allOrders = await SuccessOrder.find({
            tenant: this.tenant.id,
            cleared: false
        });

        // Filter expired orders in JavaScript
        const expiredOrders = allOrders.filter(o => {
            const orderDate = new Date(o.createdAt);
            return orderDate <= oneMonthAgo;
        });

        const tokensToSubtract = expiredOrders.reduce(
            (sum, _) => sum + (1),
            0
        );

        if (tokensToSubtract > 0) {
            const tenant = await Tenant.findById(this.tenant.id);
            const newUsed = Math.max(
                0,
                tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used - tokensToSubtract
            );

            // Update tenant pricing
            await Tenant.updateOne(
                { id: this.tenant.id },
                {
                    "shopify.billing.limits": {
                        [SystemCodes.LIMIT_TYPE[limitType]]: {
                            used: newUsed
                        }
                    }
                }
            );

            // Update all expired orders to cleared
            for (const order of expiredOrders) {
                await SuccessOrder.updateOne(
                    { id: order.id },
                    { cleared: true }
                );
            }
        }
    }

    checkLimitAvailability = async (limitType, limitAmount) => {
        limitType = limitType.toUpperCase();
        await this.clearUsage(limitType);

        this.logger.info2(`Limit check - Plan: ${this.tenant.shopify.billing.planKey}, Limit: ${this.tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].limit}, Used: ${this.tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used}, Requested: ${limitAmount}`);

        if ((this.tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].limit < this.tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used + limitAmount) 
            && this.tenant.shopify.billing.planKey !== SystemCodes.BILLING_PLANS.ENTERPRISE.KEY) 
            this.throws("Limit exceed", true);
    }

    useLimit = async (limitType, limitAmount) => {
        limitType = limitType.toUpperCase();
        const tenant = await Tenant.findById(this.tenant.id);

        const newUsed = tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used + limitAmount;

        await Tenant.updateOne(
            { id: this.tenant.id },
            {
                "shopify.billing.limits": {
                    [SystemCodes.LIMIT_TYPE[limitType]]: {
                        used: newUsed
                    }
                }
            }
        );
    }
}