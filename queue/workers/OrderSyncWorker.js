import Tenant from '../../models/db/postgres/Tenant.js';
import NebimOrderBusiness from '../../business/nebim/OrderBusiness.js';
import ShopifyOrderBusiness from '../../business/shopify/OrderBusiness.js';
import BatchTracker from '../services/BatchTracker.js';
import SuccessOrder from '../../models/db/postgres/SuccessOrder.js';
import FailedOrder from '../../models/db/postgres/FailedOrder.js';
import SystemCodes from '../../enums/SystemCodes.js';
import LogHelper from '../../helpers/LogHelper.js';

/**
 * Process order sync job
 */
export async function processOrderJob(job) {
    const { tenantId, orderId, orderData, jobType, batchId } = job.data;
    const logger = new LogHelper();

    try {
        // Load tenant
        const tenant = await Tenant.findById(tenantId);
        if (!tenant) {
            logger.error(new Error(`Tenant ${tenantId} not found`));
            return {
                ok: false,
                reason: `Tenant ${tenantId} not found`,
                ecommerceId: orderId,
            };
        }

        const batchTracker = new BatchTracker(tenant);
        const nebimOrderBusiness = new NebimOrderBusiness(tenant);
        const shopifyOrderBusiness = new ShopifyOrderBusiness(tenant);

        let result;

        if (jobType === 'create') {
            // Check if order is already synced
            const isOrderSynced = Boolean(
                await SuccessOrder.findOne({ 
                    shopifyOrderId: orderId, 
                    tenant: tenantId, 
                    isCancelled: false 
                })
            );

            if (isOrderSynced) {
                await batchTracker.trackSkippedOrder(batchId, orderId, 'already_synced', 'create');
                return {
                    ok: true,
                    skipped: true,
                    reason: 'Already synced',
                    ecommerceId: orderId,
                };
            }

            // Check if order is in failed list
            const isFailedOrderExists = Boolean(
                await FailedOrder.findOne({ 
                    tenant: tenantId, 
                    shopifyOrderId: orderId, 
                    isCancelled: false 
                })
            );

            if (isFailedOrderExists) {
                await batchTracker.trackSkippedOrder(batchId, orderId, 'failed', 'create');
                return {
                    ok: true,
                    skipped: true,
                    reason: 'Previously failed',
                    ecommerceId: orderId,
                };
            }

            // Process order creation
            result = await nebimOrderBusiness.createSingleOrder(orderData);

            if (result.ok) {
                // Update Shopify metadata
                await shopifyOrderBusiness.updateErpMetadataForOrders([{
                    ecommerceId: orderId.split('.')[1] || orderId,
                    erpId: result.erpId
                }]);

                // Remove from failed orders if exists
                await FailedOrder.deleteOne({
                    shopifyOrderId: orderId,
                    tenant: tenantId,
                    isCancelled: false,
                });
            }

        } else if (jobType === 'cancel') {
            // Find the created order
            const createdOrder = await SuccessOrder.findOne({ 
                shopifyOrderId: orderId, 
                tenant: tenantId 
            });

            if (!createdOrder) {
                await batchTracker.trackSkippedOrder(batchId, orderId, 'not_found', 'cancel');
                return {
                    ok: true,
                    skipped: true,
                    reason: 'Order not found for cancellation',
                    ecommerceId: orderId,
                };
            }

            if (createdOrder.isCancelled) {
                await batchTracker.trackSkippedOrder(batchId, orderId, 'already_synced', 'cancel');
                return {
                    ok: true,
                    skipped: true,
                    reason: 'Already cancelled',
                    ecommerceId: orderId,
                };
            }

            // Process order cancellation
            result = await nebimOrderBusiness.cancelSingleOrder(orderData, createdOrder);

            if (result.ok) {
                // Remove from failed orders if exists
                await FailedOrder.deleteOne({
                    shopifyOrderId: orderId,
                    tenant: tenantId,
                    isCancelled: true,
                });
            }
        } else {
            return {
                ok: false,
                reason: `Unknown job type: ${jobType}`,
                ecommerceId: orderId,
            };
        }

        // Update batch
        if (batchId) {
            await batchTracker.updateOrderBatch(batchId, result, jobType);
        }

        return result;
    } catch (error) {
        logger.error(new Error(`Error processing order job ${orderId}: ${error.message}`));
        return {
            ok: false,
            reason: error.message,
            ecommerceId: orderId,
            process: SystemCodes.PROCESS.SYNC_ORDERS,
        };
    }
}

