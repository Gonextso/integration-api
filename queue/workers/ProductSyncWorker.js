import Tenant from '../../models/db/postgres/Tenant.js';
import ShopifyProductBusiness from '../../business/shopify/ProductBusiness.js';
import BatchTracker from '../services/BatchTracker.js';
import LogHelper from '../../helpers/LogHelper.js';

/**
 * Process product sync job
 */
export async function processProductJob(job) {
    const { tenantId, productData, batchId } = job.data;
    const logger = new LogHelper();

    try {
        // Load tenant
        const tenant = await Tenant.findById(tenantId);
        if (!tenant) {
            logger.error(new Error(`Tenant ${tenantId} not found`));
            return {
                ok: false,
                reason: `Tenant ${tenantId} not found`,
                erpId: productData?.erp_id,
            };
        }

        const batchTracker = new BatchTracker(tenant);
        const shopifyProductBusiness = new ShopifyProductBusiness(tenant);

        // Process product sync
        const result = await shopifyProductBusiness.syncSingleProduct(productData);

        // Update batch if batchId is provided
        if (batchId) {
            await batchTracker.updateProductBatch(batchId, result);
        }

        return result;
    } catch (error) {
        logger.error(new Error(`Error processing product job ${productData?.erp_id}: ${error.message}`));
        return {
            ok: false,
            reason: error.message,
            erpId: productData?.erp_id,
        };
    }
}

