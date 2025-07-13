import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import ShopifyCache from "../../cache/ShopifyCache.js";
import CoreClass from "../../core/CoreClass.js";
import productMutations from "../../models/shopify/mutations/product.js";
import metafieldQueries from "../../models/shopify/queries/metafield.js";
import metafieldMutations from "../../models/shopify/mutations/metafield.js";


export default class ShopifyProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.cache = new ShopifyCache(tenant);
    }

    syncProductsDetailBulk = async (detailList, categoryList = []) => {
        const mutation = productMutations.sync;
        const metafields = new Set();
        const slug = text => text.replace(/ /g, "-").toLowerCase();

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
                    }),
                    metafields: product.attributes.map(x => ({
                        namespace: "gonextso_nebim_app",
                        key: slug(x.id),
                        value: x.code,
                        type: 'single_line_text_field'
                    }))
                }
            };
    
            const data = await this.api.query(mutation, variables);
    
            if (data.errors) {
                this.logger.error('GraphQL Errors:', JSON.stringify(data.errors));
                continue;
            }

            for (const attr of product.attributes) {
                metafields.add(`gonextso_nebim_app.${slug(attr.id)}`);
            }

            if (this.tenant.shopify.isInventoryTracking) this.#setProductVariantsToTracked(data.data.productSet.product);
        }

        await this.#setMetafieldDefinitions(metafields);
    } 

    #setMetafieldDefinitions = async (metafields) => {
        if (!metafields || metafields.size === 0) return;

        const existingData = await this.api.query(metafieldQueries.definitions);
        
        if (existingData.errors) {
            this.logger.error('GraphQL Errors when checking metafield definitions:', JSON.stringify(existingData.errors));
            return;
        }

        const existingDefinitions = new Set();
        existingData.data.metafieldDefinitions.edges.forEach(edge => {
            existingDefinitions.add(`${edge.node.namespace}.${edge.node.key}`);
        });

        for (const metafield of metafields) {
            if (existingDefinitions.has(metafield)) {
                continue;
            }

            const [namespace, key] = metafield.split('.');
            
            const variables = {
                definition: {
                    name: key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '),
                    namespace: namespace,
                    key: key,
                    description: "Automatically created by Gonextso Nebim Integration App",
                    type: "single_line_text_field",
                    ownerType: "PRODUCT",
                    access: { storefront: "PUBLIC_READ" },
                    pin: true
                }
            };

            const createData = await this.api.query(metafieldMutations.createDefinition, variables);

            if (createData.errors) {
                this.logger.error('GraphQL Errors when creating metafield definition:', JSON.stringify(createData.errors));
                continue;
            }

            if (createData.data.metafieldDefinitionCreate.userErrors && createData.data.metafieldDefinitionCreate.userErrors.length > 0) {
                this.logger.error('User Errors when creating metafield definition:', JSON.stringify(createData.data.metafieldDefinitionCreate.userErrors));
                continue;
            }

            this.logger.info(`Created metafield definition: ${metafield}`);
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