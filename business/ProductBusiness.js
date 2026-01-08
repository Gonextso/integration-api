import CoreClass from "../core/CoreClass.js";
import NebimProductBusiness from "./nebim/ProductBusiness.js";
import ShopifyInventoryBusiness from "./shopify/InventoryBusiness.js";
import ShopifyProductBusiness from "./shopify/ProductBusiness.js";
import SyncQueue from "../queue/SyncQueue.js";


export default class ProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.syncQueue = new SyncQueue();
    }

    syncDetailsNebimToShopify = async (startDate, _) => {
        try {
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
    
            this.logger.info2(`Sync product details started from ${startDate}`);
    
            const detailList = await nebimProductBusiness.getProductDetailList(startDate);
            
            if (!detailList || !detailList.length) {
                this.logger.info2(`No products to sync from ${startDate}`);
                return;
            }

            // Check queue status before adding
            try {
                const statusBefore = await this.syncQueue.getQueueStatus('product');
                this.logger.info(`Product queue status before adding: waiting=${statusBefore.waiting}, active=${statusBefore.active}, completed=${statusBefore.completed}, failed=${statusBefore.failed}`);
            } catch (err) {
                this.logger.error(new Error(`Error getting queue status before adding: ${err.message}`));
            }

            // Add all products to queue (only if not already in queue)
            const added = await this.syncQueue.addProductBatch(this.tenant, detailList);
            const addedCount = Array.isArray(added) ? added.filter(j => j !== null && j !== undefined).length : (added ? 1 : 0);
            this.logger.info(`Added ${addedCount}/${detailList.length} product jobs to queue (${detailList.length - addedCount} already in queue)`);
            
            // Log added job IDs for verification
            if (Array.isArray(added) && added.length > 0) {
                const jobIds = added
                    .filter(j => j !== null && j !== undefined)
                    .map(j => j.id || j.opts?.jobId || 'unknown')
                    .slice(0, 5); // Log first 5 job IDs
                this.logger.info(`Sample job IDs added: ${jobIds.join(', ')}${added.length > 5 ? '...' : ''}`);
            }
            
            // Log queue status after adding (with a small delay to allow queue to update)
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            
            try {
                const statusAfter = await this.syncQueue.getQueueStatus('product');
                this.logger.info(`Product queue status after adding (500ms delay): waiting=${statusAfter.waiting}, active=${statusAfter.active}, completed=${statusAfter.completed} (historical), failed=${statusAfter.failed} (historical)`);
                
                if (addedCount > 0 && statusAfter.waiting === 0 && statusAfter.active === 0) {
                    this.logger.warn(`Warning: ${addedCount} jobs were added but queue shows 0 waiting/active jobs. Jobs may have been processed immediately or not added correctly.`);
                }
            } catch (err) {
                this.logger.error(new Error(`Error getting queue status after adding: ${err.message}`));
            }

            // Jobs will be processed by workers asynchronously
        } catch (error) {
            this.logger.error(new Error(`Error syncing product details from ${startDate}, error: ${error.message}`));
        } finally {
            this.logger.info2(`Sync product details finished from ${startDate}`);
        }
    }

    syncInventoryNebimToShopify = async (startDate, _) => {
        try {
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
            const shopifyInventoryBusiness = new ShopifyInventoryBusiness(this.tenant);
    
            this.logger.info2(`Sync inventory started from ${startDate}`);
    
            const inventories = await nebimProductBusiness.fetchInventories(startDate);
                    
            shopifyInventoryBusiness.syncInventoryBulk(inventories);
        } catch (error) {
            this.logger.error(new Error(`Error syncing inventory from ${startDate}, error: ${error.message}`));
        } finally {
            this.logger.info2(`Sync inventory finished from ${startDate}`);
        }
    }
}