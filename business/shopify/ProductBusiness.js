import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import ShopifyCache from "../../cache/ShopifyCache.js";
import CoreClass from "../../core/CoreClass.js";
import product from "../../models/shopify/queries/product.js";

export default class ShopifyProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.cache = new ShopifyCache(tenant);
    }
}