import OrderSyncBatch from '../../models/db/postgres/OrderSyncBatch.js';
import FailedOrder from '../../models/db/postgres/FailedOrder.js';
import SuccessOrder from '../../models/db/postgres/SuccessOrder.js';
import SystemCodes from '../../enums/SystemCodes.js';
import LogHelper from '../../helpers/LogHelper.js';

export default class BatchTracker {
    constructor(tenant) {
        this.tenant = tenant;
        this.logger = new LogHelper(tenant);
    }

    /**
     * Update batch when an order job completes (success or failure)
     */
    async updateOrderBatch(batchId, result, jobType = 'create') {
        try {
            const batch = await OrderSyncBatch.findOne({ id: batchId });
            if (!batch) {
                this.logger.error(new Error(`Batch ${batchId} not found`));
                return;
            }

            const updateData = { ...batch };

            if (result.ok) {
                // Success case
                if (jobType === 'create') {
                    updateData.numbers.createOrderSuccess = (updateData.numbers.createOrderSuccess || 0) + 1;
                    
                    // Create SuccessOrder record
                    await SuccessOrder.create({
                        tenant: this.tenant.id,
                        syncBatchId: batchId,
                        shopifyOrderId: result.ecommerceId,
                        nebimOrderId: result.erpId,
                        lines: result.lines || null,
                        partiallyCancelledLines: result.partiallyCancelledLines || null,
                        isCancelled: result.isCancelled || false,
                        isPartiallyCancelled: result.isPartiallyCancelled || false,
                    });
                } else if (jobType === 'cancel') {
                    updateData.numbers.cancelOrderSuccess = (updateData.numbers.cancelOrderSuccess || 0) + 1;
                    
                    // Update or create SuccessOrder record
                    const existingSuccess = await SuccessOrder.findOne({
                        shopifyOrderId: result.ecommerceId,
                        tenant: this.tenant.id,
                    });

                    if (existingSuccess) {
                        await SuccessOrder.updateOne(
                            { id: existingSuccess.id },
                            {
                                isCancelled: true,
                                syncBatchId: batchId,
                            }
                        );
                    } else {
                        await SuccessOrder.create({
                            tenant: this.tenant.id,
                            syncBatchId: batchId,
                            shopifyOrderId: result.ecommerceId,
                            nebimOrderId: result.erpId,
                            isCancelled: true,
                        });
                    }

                    // Remove from failed orders if exists
                    await FailedOrder.deleteOne({
                        shopifyOrderId: result.ecommerceId,
                        tenant: this.tenant.id,
                        isCancelled: true,
                    });
                }
            } else {
                // Failure case
                if (jobType === 'create') {
                    updateData.numbers.createOrderError = (updateData.numbers.createOrderError || 0) + 1;
                    updateData.isErrorLogExistsForThisBatch = true;

                    // Create or update FailedOrder record
                    await FailedOrder.updateOne(
                        {
                            shopifyOrderId: result.ecommerceId,
                            tenant: this.tenant.id,
                            isCancelled: false,
                        },
                        {
                            shopifyOrderId: result.ecommerceId,
                            tenant: this.tenant.id,
                            syncBatchId: batchId,
                            reason: result.reason,
                            process: result.process || SystemCodes.PROCESS.SYNC_ORDERS,
                            isCancelled: false,
                        },
                        { upsert: true }
                    );
                } else if (jobType === 'cancel') {
                    updateData.numbers.cancelOrderError = (updateData.numbers.cancelOrderError || 0) + 1;
                    updateData.isErrorLogExistsForThisBatch = true;

                    // Create or update FailedOrder record
                    await FailedOrder.updateOne(
                        {
                            shopifyOrderId: result.ecommerceId,
                            tenant: this.tenant.id,
                            isCancelled: true,
                        },
                        {
                            shopifyOrderId: result.ecommerceId,
                            tenant: this.tenant.id,
                            syncBatchId: batchId,
                            reason: result.reason,
                            process: result.process || SystemCodes.PROCESS.SYNC_CANCEL_ORDERS,
                            isCancelled: true,
                        },
                        { upsert: true }
                    );
                }
            }

            // Update batch
            await OrderSyncBatch.updateOne({ id: batchId }, updateData);

            // Check if batch is complete
            await this.checkBatchCompletion(batchId);
        } catch (error) {
            this.logger.error(new Error(`Error updating order batch ${batchId}: ${error.message}`));
        }
    }

    /**
     * Update batch when a product job completes (success or failure)
     */
    async updateProductBatch(batchId, result) {
        try {
            const batch = await OrderSyncBatch.findOne({ id: batchId });
            if (!batch) {
                this.logger.error(new Error(`Batch ${batchId} not found`));
                return;
            }

            // Product batches might use a different model structure
            // For now, we'll track in the same way
            // This can be extended when ProductSyncedBatch is integrated

            if (result.ok) {
                // Success case - product synced successfully
                // Update batch success count if applicable
            } else {
                // Failure case
                // Log product sync failure
                this.logger.error(new Error(`Product sync failed: ${result.reason}`));
            }

            // Check if batch is complete
            await this.checkBatchCompletion(batchId);
        } catch (error) {
            this.logger.error(new Error(`Error updating product batch ${batchId}: ${error.message}`));
        }
    }

    /**
     * Check if batch is complete and mark it accordingly
     */
    async checkBatchCompletion(batchId) {
        try {
            const batch = await OrderSyncBatch.findOne({ id: batchId });
            if (!batch) return;

            const numbers = batch.numbers || {};
            const total = numbers.total || 0;
            const createOrderTotal = numbers.createOrderTotal || 0;
            const cancelOrderTotal = numbers.cancelOrderTotal || 0;
            
            const createOrderProcessed = (numbers.createOrderSuccess || 0) + 
                                       (numbers.createOrderError || 0) + 
                                       (numbers.createOrderSkippedTotal || 0);
            
            const cancelOrderProcessed = (numbers.cancelOrderSuccess || 0) + 
                                        (numbers.cancelOrderError || 0) + 
                                        (numbers.cancelOrderSkippedTotal || 0);

            const totalProcessed = createOrderProcessed + cancelOrderProcessed;

            // If all orders are processed, mark batch as complete
            // Note: This is a simple check - in production you might want to track
            // individual job completion more precisely
            if (totalProcessed >= total && total > 0) {
                // Batch is complete
                // You can add a status field to mark it as completed if needed
                this.logger.info2(`Batch ${batchId} completed: ${totalProcessed}/${total} orders processed`);
            }
        } catch (error) {
            this.logger.error(new Error(`Error checking batch completion ${batchId}: ${error.message}`));
        }
    }

    /**
     * Track skipped orders (already synced or failed previously)
     */
    async trackSkippedOrder(batchId, orderId, skipReason, jobType = 'create') {
        try {
            const batch = await OrderSyncBatch.findOne({ id: batchId });
            if (!batch) return;

            const updateData = { ...batch };

            if (jobType === 'create') {
                if (skipReason === 'already_synced') {
                    updateData.numbers.createOrderSkippedAlreadySynced = 
                        (updateData.numbers.createOrderSkippedAlreadySynced || 0) + 1;
                } else if (skipReason === 'failed') {
                    updateData.numbers.createOrderSkippedFailed = 
                        (updateData.numbers.createOrderSkippedFailed || 0) + 1;
                }
                updateData.numbers.createOrderSkippedTotal = 
                    (updateData.numbers.createOrderSkippedTotal || 0) + 1;
            } else if (jobType === 'cancel') {
                if (skipReason === 'already_synced') {
                    updateData.numbers.cancelOrderSkippedAlreadySynced = 
                        (updateData.numbers.cancelOrderSkippedAlreadySynced || 0) + 1;
                } else if (skipReason === 'failed') {
                    updateData.numbers.cancelOrderSkippedFailed = 
                        (updateData.numbers.cancelOrderSkippedFailed || 0) + 1;
                } else if (skipReason === 'not_found') {
                    updateData.numbers.cancelOrderSkippedNotFound = 
                        (updateData.numbers.cancelOrderSkippedNotFound || 0) + 1;
                }
                updateData.numbers.cancelOrderSkippedTotal = 
                    (updateData.numbers.cancelOrderSkippedTotal || 0) + 1;
            }

            await OrderSyncBatch.updateOne({ id: batchId }, updateData);
        } catch (error) {
            this.logger.error(new Error(`Error tracking skipped order: ${error.message}`));
        }
    }
}

