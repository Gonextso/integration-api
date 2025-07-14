import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import SuccessOrder from "../models/db/SuccessOrder.js";
import Tenant from "../models/db/Tenant.js";

export default class LimitBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    clearUsage = async (limitType) => {
        const oneMonthAgo = new Date();
        limitType = limitType.toUpperCase();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const expiredOrders = await SuccessOrder.find({
            tenant: this.tenant._id,
            createdAt: { $lte: oneMonthAgo },
            cleared: { $ne: true }
        });

        const tokensToSubtract = expiredOrders.reduce(
            (sum, _) => sum + (1),
            0
        );

        if (tokensToSubtract > 0) {
            const tenant = await Tenant.findById(this.tenant._id);
            tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used = Math.max(
                0,
                tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used - tokensToSubtract
            );
            await tenant.save();

            await SuccessOrder.updateMany(
                { _id: { $in: expiredOrders.map((o) => o._id) } },
                { $set: { cleared: true } }
            );
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
        const tenant = await Tenant.findById(this.tenant._id);

        tenant.shopify.billing.limits[SystemCodes.LIMIT_TYPE[limitType]].used += limitAmount;

        await tenant.save()
    }
}