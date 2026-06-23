import CoreClass from "../core/CoreClass.js";
import NebimProductBusiness from "./nebim/ProductBusiness.js";
import ShopifyInventoryBusiness from "./shopify/InventoryBusiness.js";
import ShopifyProductBusiness from "./shopify/ProductBusiness.js";
import ShopifyFindInStoreBusiness from "./shopify/FindInStoreBusiness.js";
import SystemCodes from "../enums/SystemCodes.js";
import Tenant from "../models/db/postgres/Tenant.js";


export default class ProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    syncDetailsNebimToShopify = async (startDate, _) => {
        try {
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
            const shopifyProductBusiness = new ShopifyProductBusiness(this.tenant);
    
            this.logger.info2(`Sync product details started from ${startDate}`);
    
            const detailList = await nebimProductBusiness.getProductDetailList(startDate);
            console.log(`detailList length: ${detailList.length}`);
            
            shopifyProductBusiness.syncProductsDetailBulk(detailList);
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

    syncFindInStoreNebimToShopify = async _ => {
        try {
            if (this.tenant.shopify?.billing?.planKey !== SystemCodes.BILLING_PLANS.ENTERPRISE.KEY) {
                await Tenant.disableFindInStoreSchedule(this.tenant.id);
                this.logger.info2("Sync find in store skipped: tenant is not on ENTERPRISE plan; schedule disabled.");
                return;
            }

            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
            const findInStoreBusiness = new ShopifyFindInStoreBusiness(this.tenant);
            const batchSize = SystemCodes.FIND_IN_STORE.BARCODE_BATCH_SIZE;

            this.logger.info2("Sync find in store started");

            const barcodes = await findInStoreBusiness.fetchBarcodesFromShopify();
            if (!barcodes.length) {
                this.logger.info2("Sync find in store skipped: no barcodes found on Shopify.");
                return;
            }

            const chunks = [];
            for (let i = 0; i < barcodes.length; i += batchSize) {
                chunks.push(barcodes.slice(i, i + batchSize));
            }

            const results = await Promise.allSettled(
                chunks.map(async barcodeBatch => {
                    const grouped = await nebimProductBusiness.fetchFindInStoreByBarcodes(barcodeBatch);
                    await findInStoreBusiness.syncMetafieldsForBarcodes(grouped);
                })
            );

            const failed = results.filter(result => result.status === "rejected");
            if (failed.length) {
                this.logger.error(new Error(`Find in store sync completed with ${failed.length} failed batch(es).`));
            }
        } catch (error) {
            this.logger.error(new Error(`Error syncing find in store, error: ${error.message}`));
        } finally {
            this.logger.info2("Sync find in store finished");
        }
    }
}