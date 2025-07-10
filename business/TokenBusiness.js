import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import SuccessOrder from "../models/db/SuccessOrder.js";
import Tenant from "../models/db/Tenant.js";

export default class TokenBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    clearUsage = async _ => {
        const oneMonthAgo = new Date();
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
            tenant.shopify.billing.tokenUsed = Math.max(
                0,
                tenant.shopify.billing.tokenUsed - tokensToSubtract
            );
            await tenant.save();

            await SuccessOrder.updateMany(
                { _id: { $in: expiredOrders.map((o) => o._id) } },
                { $set: { cleared: true } }
            );
        }
    }

    checkTenantTokenAvailability = async tokenAmount => {
        await this.clearUsage();

        if ((this.tenant.shopify.billing.tokenLimit <= this.tenant.shopify.billing.tokenUsed + tokenAmount) && this.tenant.shopify.billing.planKey !== SystemCodes.BILLING_PLANS.ENTERPRISE.KEY) 
            this.throws("Token limit exceed", true);
    }

    useToken = async tokenAmount => {
        const tenant = await Tenant.findById(this.tenant._id);

        tenant.shopify.billing.tokenUsed += tokenAmount;

        await tenant.save()
    }
}