import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import ShopifyCache from "../../cache/ShopifyCache.js";
import CoreClass from "../../core/CoreClass.js";
import productMutations from "../../models/shopify/mutations/product.js";


export default class ShopifyProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.cache = new ShopifyCache(tenant);
    }

    syncProductsDetailBulk = async (detailList, categoryList = []) => {
        const mutation = productMutations.sync;

        for (const product of detailList) {
            const productSizeOp = new Set();
            const productColorOp = new Set();
    
            for (const variant of product.variants) {
                productColorOp.add(variant.color);
                productSizeOp.add(variant.dimention);
            };

            const category = categoryList.length ? categoryList.filter(x => x.erpKey === product.category)[0] ?? {} : {};
    
            const variables = {
                synchronous: true,
                productSet: {
                    title: product.title,
                    category: category.ecommerceKey ? category.ecommerceKey : null,
                    productOptions: [
                        productColorOp.size ? {
                            name: "Color",
                            position: 1, //TODO: can be ordered via user interaction
                            values: [...productColorOp].map(x => ({ name: x }))
                        } : null,
                        productSizeOp.size ? {
                            name: "Size",
                            position: 2, //TODO: can be ordered via user interaction
                            values: [...productSizeOp].map(x => ({ name: x }))
                        } : null
                    ].filter(x => x),
                    variants: product.variants.map(x => {
                        return {
                            optionValues: [
                                x.color ? {
                                    optionName: "Color",
                                    name: x.color
                                } : null,
                                x.dimention ? {
                                    optionName: "Size",
                                    name: x.dimention
                                } : null
                            ].filter(y => y),
                            price: x.sale_price,
                            barcode: x.barcode,
                            sku: product.erp_id.concat(x.color ? x.color.replace(/ /g, "-") : "NC-", x.dimention ? x.dimention.replace(/ /g, "-") : "ND") //TODO: facia bir sonuç ortaya çıkabiliyor
                        }
                    })
                }
            };
    
            const data = await this.api.query(mutation, variables);
    
            if (data.errors) {
                this.logger.error('GraphQL Errors:', JSON.stringify(data.errors));
                continue;
            }
    
            if (this.tenant.shopify.isInventoryTracking) this.#setProductVariantsToTracked(data.data.productSet.product);
        }
    }

    #setProductVariantsToTracked = async ({ id, variants }) => {
        const mutation = productMutations.variantBulkUpdate;

        const variables = {
            productId: id,
            variants: variants.nodes.map(x => ({ id: x.id, inventoryItem: { tracked: true } }))
        }

        const data = await this.api.query(mutation, variables);

        if (data.errors) {
            this.logger.error('GraphQL Errors:', JSON.stringify(data.errors));
            return;
        }
    }
}