import CoreClass from "../core/CoreClass.js";
import NebimProductBusiness from "./nebim/ProductBusiness.js";
import ShopifyProductBusiness from "./shopify/ProductBusiness.js";
import ShopifyInventoryBusiness from "./shopify/InventoryBusiness.js";
import SyncedBarcode from "../models/db/postgres/SyncedBarcode.js";

export default class ProductSetupBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    #buildProductAdminUrl = productGid => {
        const shop = this.tenant.shopify?.domain || this.tenant.name;
        const numericId = productGid?.split("/").pop();
        if (!shop || !numericId) return null;
        return `https://${shop}/admin/products/${numericId}`;
    };

    runSetupTest = async itemCode => {
        const trimmed = itemCode?.trim();
        if (!trimmed) {
            throw new Error("ItemCode is required");
        }

        const nebimProduct = new NebimProductBusiness(this.tenant);
        const detailList = await nebimProduct.getProductDetailListByItemCode(trimmed);

        if (!detailList.length) {
            throw new Error(`Ürün bulunamadı: ${trimmed}`);
        }

        const shopifyProduct = new ShopifyProductBusiness(this.tenant);
        await shopifyProduct.syncProductsDetailBulk(detailList);

        const barcodes = detailList.flatMap(product =>
            (product.variants ?? []).map(variant => variant.barcode).filter(Boolean),
        );

        let productId = null;
        for (const barcode of barcodes) {
            const doc = await SyncedBarcode.findOne({ barcode, tenant: this.tenant.id });
            if (doc?.productId) {
                productId = doc.productId;
                break;
            }
        }

        if (!productId) {
            throw new Error("Ürün Shopify'a aktarılamadı");
        }

        const inventories = await nebimProduct.fetchInventoriesByItemCode(trimmed);
        if (inventories.length && this.tenant.shopify?.isInventoryTracking) {
            const inventoryBusiness = new ShopifyInventoryBusiness(this.tenant);
            await inventoryBusiness.syncInventoryBulk(inventories);
        }

        const productUrl = this.#buildProductAdminUrl(productId);
        if (!productUrl) {
            throw new Error("Ürün linki oluşturulamadı");
        }

        return {
            itemCode: trimmed,
            productUrl,
            productId,
        };
    };
}
