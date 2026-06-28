import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import SuccessOrder from "../models/db/postgres/SuccessOrder.js";
import SyncedBarcode from "../models/db/postgres/SyncedBarcode.js";
import Tenant from "../models/db/postgres/Tenant.js";

export default class LimitBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    #normalizeLimitType = limitType => SystemCodes.LIMIT_TYPE[limitType.toUpperCase()];

    // Usage is derived from what actually exists in the database, never incremented:
    // product_details = synced SKUs, order = non-cancelled orders in the last month.
    getUsage = async (limitType) => {
        limitType = this.#normalizeLimitType(limitType);

        if (limitType === SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS) {
            return SyncedBarcode.count({ tenant: this.tenant.id });
        }

        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        return SuccessOrder.count({
            tenant: this.tenant.id,
            isCancelled: false,
            createdAt: { $gte: oneMonthAgo }
        });
    }

    getRemaining = async (limitType) => {
        const normalizedType = this.#normalizeLimitType(limitType);
        const tenant = await Tenant.findById(this.tenant.id);
        const limit = tenant.shopify.billing.limits[normalizedType].limit;
        const used = await this.getUsage(limitType);
        const isUnlimited = tenant.shopify.billing.planKey === SystemCodes.BILLING_PLANS.ENTERPRISE.KEY;

        return {
            limit,
            used,
            remaining: isUnlimited ? Infinity : Math.max(0, limit - used),
            isUnlimited
        };
    }

    checkLimitAvailability = async (limitType, limitAmount) => {
        const { limit, used, isUnlimited } = await this.getRemaining(limitType);

        this.logger.info2(`Limit check (derived) - Plan: ${this.tenant.shopify.billing.planKey}, Limit: ${limit}, Used: ${used}, Requested: ${limitAmount}`);

        if (isUnlimited) return;

        if (limit < used + limitAmount)
            this.throws("Limit exceed", true);
    }

    // Idempotent denormalized write for external readers of billings.pricing
    // (config-api / admin UI). Must never fail the sync that calls it.
    syncUsageSnapshot = async (limitType) => {
        try {
            const normalizedType = this.#normalizeLimitType(limitType);
            const used = await this.getUsage(limitType);

            await Tenant.updateOne(
                { id: this.tenant.id },
                {
                    "shopify.billing.limits": {
                        [normalizedType]: {
                            used
                        }
                    }
                }
            );

            return used;
        } catch (error) {
            this.logger.error(new Error(`Failed to sync usage snapshot for ${limitType}: ${error.message}`));
            return null;
        }
    }
}
