import CoreClass from "../core/CoreClass.js";
import NebimProductBusiness from "./nebim/ProductBusiness.js";
import ShopifyInventoryBusiness from "./shopify/InventoryBusiness.js";
import ShopifyProductBusiness from "./shopify/ProductBusiness.js";


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
}