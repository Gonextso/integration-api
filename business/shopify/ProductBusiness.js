import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import ShopifyCache from "../../cache/ShopifyCache.js";
import CoreClass from "../../core/CoreClass.js";
import productMutations from "../../models/shopify/mutations/product.js";
import metafieldQueries from "../../models/shopify/queries/metafield.js";
import metafieldMutations from "../../models/shopify/mutations/metafield.js";
import SyncedBarcode from "../../models/db/postgres/SyncedBarcode.js";
import LimitBusiness from "../LimitBusiness.js";
import Tenant from "../../models/db/postgres/Tenant.js";
import SystemCodes from "../../enums/SystemCodes.js";
import SystemHelper from "../../helpers/SystemHelper.js";
import SystemCache from "../../cache/SystemCache.js";
import CacheFields from "../../enums/CacheFields.js";

export default class ShopifyProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.cache = new ShopifyCache(tenant);
    }

    syncProductsDetailBulk = async (detailList, categoryList = []) => {
        const mutation = productMutations.sync;
        const metafields = new Set();
        const variantMetafields = new Set();
        const variantBlockedMetafieldKey = "gonextso_nebim_app.is_blocked_by_erp";
        let promises = [];
        const slug = text => text.replace(/ /g, "-").toLowerCase();

        for (const product of detailList) {
            const productSizeOp = new Set();
            const productColorOp = new Set();
            const barcodes = product.variants.map(x => x.barcode).filter(Boolean);
            const syncedBarcodeDocs = barcodes.length ? await SyncedBarcode.find({
                barcode: { $in: barcodes },
                tenant: this.tenant.id
            }) : [];
            const syncedBarcodeMap = new Map();
            let existingProductId = null;

            for (const doc of syncedBarcodeDocs) {
                syncedBarcodeMap.set(doc.barcode, doc);
                if (!existingProductId && doc.productId) {
                    existingProductId = doc.productId;
                }
            }

            if (this.tenant.shopify.billing.planKey !== SystemCodes.BILLING_PLANS.ENTERPRISE.KEY) {
                const limitBusiness = new LimitBusiness(await Tenant.findById(this.tenant.id));
                let isProductAlreadySynced = syncedBarcodeDocs.length > 0;
                let isLimitAvailable = true;

                for (const variant of product.variants) {
                    try {
                        await limitBusiness.checkLimitAvailability(SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS, 1);
                    } catch (error) {
                        isLimitAvailable = false;
                    }

                    const existingSync = syncedBarcodeMap.get(variant.barcode);

                    if (!isLimitAvailable && existingSync) {
                        isLimitAvailable = true;
                        isProductAlreadySynced = true;
                        this.logger.info4(`Barcode ${variant.barcode} already synced, skipping limit check`);
                    }

                    if (!isLimitAvailable) {
                        this.logger.warn2("SKU limit exceed");
                        break;
                    }

                    productColorOp.add(variant.color);
                    productSizeOp.add(variant.dimention);
                };

                if (!isLimitAvailable) {
                    break;
                }

                const category = categoryList.length ? categoryList.filter(x => x.erpKey === product.category)[0] ?? {} : {};

                const variables = {
                    synchronous: true,
                    productSet: {
                        ...(existingProductId ? { id: existingProductId } : {}),
                        status: "DRAFT",
                        title: product.title,
                        category: category.ecommerceKey ? category.ecommerceKey : null,
                        productOptions: [
                            productColorOp.size ? {
                                name: "Color",
                                position: this.tenant.shopify.isColorOptionFirst ? 1 : 2,
                                values: [...productColorOp].map(x => ({ name: x }))
                            } : null,
                            productSizeOp.size ? {
                                name: "Size",
                                position: this.tenant.shopify.isColorOptionFirst ? 2 : 1,
                                values: [...productSizeOp].map(x => ({ name: x }))
                            } : null
                        ].filter(x => x),
                        variants: product.variants.map(x => {
                            const existingSync = syncedBarcodeMap.get(x.barcode);
                            const variantInput = {
                                optionValues: [
                                    x.color ? {
                                        optionName: "Color",
                                        name: x.color
                                    } : null,
                                    x.dimention ? {
                                        optionName: "Size",
                                        name: x.dimention
                                    } : null
                                ].filter(Boolean),
                                price: x.sale_price,
                                barcode: x.barcode,
                                sku: x.sku,
                                metafields: [{
                                    namespace: "gonextso_nebim_app",
                                    key: "is_blocked_by_erp",
                                    value: String(Boolean(x.is_blocked_by_erp)),
                                    type: "boolean"
                                }]
                            };

                            variantMetafields.add(variantBlockedMetafieldKey);
                            if (existingSync?.variantId) {
                                variantInput.id = existingSync.variantId;
                            }

                            return variantInput;
                        }),
                        metafields: product.attributes.map(x => ({
                            namespace: "gonextso_nebim_app",
                            key: slug(x.id),
                            value: x.code,
                            type: 'single_line_text_field'
                        })).concat({
                            namespace: "gonextso_nebim_app",
                            key: "ItemCode",
                            value: product.erp_id,
                            type: 'single_line_text_field'
                        }),
                    }
                };

                let data = await this.api.query(mutation, variables);

                // Check if product doesn't exist and retry without ID
                if (data?.data?.productSet?.userErrors?.some(error => error.message === "Product does not exist")) {
                    this.logger.warn2(`Product ${existingProductId} does not exist in Shopify, retrying without ID to create new product`);
                    // Remove ID and retry
                    delete variables.productSet.id;
                    existingProductId = null;
                    data = await this.api.query(mutation, variables);
                }

                if (!data || data.errors || data.userErrors || (data.data?.productSet?.userErrors && data.data.productSet.userErrors.length > 0)) {
                    this.logger.error('GraphQL Errors:', JSON.stringify(data?.errors || data?.data?.productSet?.userErrors || data));
                    continue;
                }

                const shopifyProduct = data.data.productSet?.product ?? {};
                const variantNodes = shopifyProduct.variants?.nodes ?? [];
                if (!existingProductId && shopifyProduct.id) {
                    existingProductId = shopifyProduct.id;
                }

                for (const attr of product.attributes
                    .concat({ id: "ItemCode" })) {
                    metafields.add(`gonextso_nebim_app.${slug(attr.id)}`);
                }

                if (this.tenant.shopify.isInventoryTracking) this.#setProductVariantsToTracked(data.data.productSet.product);

                for (let index = 0; index < product.variants.length; index++) {
                    const variant = product.variants[index];
                    const existingSync = syncedBarcodeMap.get(variant.barcode);
                    const variantNode = variantNodes[index] ?? {};
                    await SyncedBarcode.updateOne(
                        {
                            barcode: variant.barcode,
                            tenant: this.tenant.id
                        },
                        {
                            barcode: variant.barcode,
                            tenant: this.tenant.id,
                            productId: shopifyProduct.id ?? existingSync?.productId ?? null,
                            variantId: variantNode.id ?? existingSync?.variantId ?? null
                        },
                        { upsert: true }
                    );
                }

                if (this.tenant.shopify.billing.planKey !== SystemCodes.BILLING_PLANS.ENTERPRISE.KEY && !isProductAlreadySynced)
                    await limitBusiness.useLimit(SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS, product.variants.length);
            } else if (this.tenant.shopify.billing.planKey === SystemCodes.BILLING_PLANS.ENTERPRISE.KEY || this.tenant.shopify.billing.planKey === SystemCodes.BILLING_PLANS.PRO.KEY) {
                promises.push(async () => {
                    this.logger.info4(`Syncing product ${product.erp_id} in parallel`);
                    
                    const systemCache = new SystemCache(this.tenant);
                    const localBarcodes = product.variants.map(x => x.barcode).filter(Boolean);
                    let lockKeys = null;

                    try {
                        // Acquire locks for all barcodes to prevent race conditions
                        lockKeys = await this.#acquireBarcodeLocks(localBarcodes, systemCache);
                        
                        if (!lockKeys) {
                            this.logger.warn2(`Could not acquire locks for product ${product.erp_id} barcodes, skipping`);
                            return;
                        }

                        // Re-check SyncedBarcode inside promise to avoid race conditions in parallel execution
                        const localSyncedBarcodeDocs = localBarcodes.length ? await SyncedBarcode.find({
                            barcode: { $in: localBarcodes },
                            tenant: this.tenant.id
                        }) : [];
                        const localSyncedBarcodeMap = new Map();
                        let localExistingProductId = null;

                        for (const doc of localSyncedBarcodeDocs) {
                            localSyncedBarcodeMap.set(doc.barcode, doc);
                            if (!localExistingProductId && doc.productId) {
                                localExistingProductId = doc.productId;
                            }
                        }

                        // Check limit availability for PRO plan (ENTERPRISE skips limit check)
                        if (this.tenant.shopify.billing.planKey === SystemCodes.BILLING_PLANS.PRO.KEY) {
                            const limitBusiness = new LimitBusiness(await Tenant.findById(this.tenant.id));
                            for (const variant of product.variants) {
                                try {
                                    await limitBusiness.checkLimitAvailability(SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS, 1);
                                } catch (error) {
                                    this.logger.warn2(`SKU limit exceed for product ${product.erp_id}, variant ${variant.barcode}`);
                                    return;
                                }
                            }
                        }

                        for (const variant of product.variants) {
                            productColorOp.add(variant.color);
                            productSizeOp.add(variant.dimention);
                        };

                        const category = categoryList.length ? categoryList.filter(x => x.erpKey === product.category)[0] ?? {} : {};

                        const variables = {
                            synchronous: true,
                            productSet: {
                            ...(localExistingProductId ? { id: localExistingProductId } : {}),
                            status: "DRAFT",
                            title: product.title,
                            category: category.ecommerceKey ? category.ecommerceKey : null,
                            productOptions: [
                                productColorOp.size ? {
                                    name: "Color",
                                    position: this.tenant.shopify.isColorOptionFirst ? 1 : 2,
                                    values: [...productColorOp].map(x => ({ name: x }))
                                } : null,
                                productSizeOp.size ? {
                                    name: "Size",
                                    position: this.tenant.shopify.isColorOptionFirst ? 2 : 1,
                                    values: [...productSizeOp].map(x => ({ name: x }))
                                } : null
                            ].filter(Boolean),
                            variants: product.variants.map(x => {
                                const existingSync = localSyncedBarcodeMap.get(x.barcode);
                                const variantInput = {
                                    optionValues: [
                                        x.color ? {
                                            optionName: "Color",
                                            name: x.color
                                        } : null,
                                        x.dimention ? {
                                            optionName: "Size",
                                            name: x.dimention
                                        } : null
                                    ].filter(Boolean),
                                    price: x.sale_price,
                                    barcode: x.barcode,
                                    sku: x.sku,
                                    metafields: [{
                                        namespace: "gonextso_nebim_app",
                                        key: "is_blocked_by_erp",
                                        value: String(Boolean(x.is_blocked_by_erp)),
                                        type: "boolean"
                                    }]
                                };

                                variantMetafields.add(variantBlockedMetafieldKey);
                                if (existingSync?.variantId) {
                                    variantInput.id = existingSync.variantId;
                                }

                                return variantInput;
                            }),
                            metafields: product.attributes.map(x => ({
                                namespace: "gonextso_nebim_app",
                                key: slug(x.id),
                                value: x.code,
                                type: 'single_line_text_field'
                            })).concat({
                                namespace: "gonextso_nebim_app",
                                key: "ItemCode",
                                value: product.erp_id,
                                type: 'single_line_text_field'
                            })
                        }
                        };

                        let data = await this.api.query(mutation, variables);

                        // Check if product doesn't exist and retry without ID
                        if (data?.data?.productSet?.userErrors?.some(error => error.message === "Product does not exist")) {
                            this.logger.warn2(`Product ${localExistingProductId} does not exist in Shopify, retrying without ID to create new product`);
                            // Remove ID and retry
                            delete variables.productSet.id;
                            localExistingProductId = null;
                            data = await this.api.query(mutation, variables);
                        }

                        if (data.errors || data.userErrors || (data.data?.productSet?.userErrors && data.data.productSet.userErrors.length > 0)) {
                            this.logger.error('GraphQL Errors:', JSON.stringify(data?.errors || data?.data?.productSet?.userErrors || data));
                            return;
                        }

                        const shopifyProduct = data.data.productSet?.product ?? {};
                        const variantNodes = shopifyProduct.variants?.nodes ?? [];

                        for (const attr of product.attributes
                            .concat({ id: "ItemCode" })) {
                            metafields.add(`gonextso_nebim_app.${slug(attr.id)}`);
                        }

                        if (this.tenant.shopify.isInventoryTracking) this.#setProductVariantsToTracked(data.data.productSet.product);

                        // Update localExistingProductId if product was just created
                        if (!localExistingProductId && shopifyProduct.id) {
                            localExistingProductId = shopifyProduct.id;
                        }

                        for (let index = 0; index < product.variants.length; index++) {
                            const variant = product.variants[index];
                            const existingSync = localSyncedBarcodeMap.get(variant.barcode);
                            const variantNode = variantNodes[index] ?? {};
                            await SyncedBarcode.updateOne(
                                {
                                    barcode: variant.barcode,
                                    tenant: this.tenant.id
                                },
                                {
                                    barcode: variant.barcode,
                                    tenant: this.tenant.id,
                                    productId: shopifyProduct.id ?? localExistingProductId ?? existingSync?.productId ?? null,
                                    variantId: variantNode.id ?? existingSync?.variantId ?? null
                                },
                                { upsert: true }
                            );

                            // Increment limit usage for PRO and ENTERPRISE on every sync
                            const limitBusiness = new LimitBusiness(await Tenant.findById(this.tenant.id));
                            await limitBusiness.useLimit(SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS, 1);
                        }
                    } finally {
                        // Always release locks, even if error occurred
                        if (lockKeys) {
                            await this.#releaseBarcodeLocks(lockKeys, systemCache);
                        }
                    }
                });
            }
        }

        if (promises.length > 0) {
            this.logger.info4(`Syncing ${promises.length} products in parallel`);
            let breath = 0;
            let deepBreath = 0;
            
            for (let i = 0; i < promises.length; i += 2) {
                const chunkPromises = promises
                    .slice(i, i + 2)  
                    .map(fn => fn()); 
                await Promise.allSettled(chunkPromises);
                breath++;

                if (breath >= 5) {
                    this.logger.info2(`Breathing for 2.5sec`);
                    await SystemHelper.wait(2500);
                    breath = 0;
                    deepBreath++;
                }

                if (deepBreath >= 100) {
                    this.logger.info2(`Deep breathing for 10sec`);
                    await SystemHelper.wait(10000);
                    deepBreath = 0;
                }
            }
        }

        await this.#setMetafieldDefinitions(metafields, "PRODUCT");
        await this.#setMetafieldDefinitions(variantMetafields, "PRODUCTVARIANT");
    }

    #setMetafieldDefinitions = async (metafields, ownerType) => {
        if (!metafields || metafields.size === 0) return;

        const existingData = await this.api.query(metafieldQueries.definitionsByOwnerType, {
            ownerType
        });

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
                    ownerType: ownerType,
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

        if (!data || data.errors) {
            this.logger.error('GraphQL Errors:', JSON.stringify(data?.errors || data));
        }
    }

    #acquireBarcodeLocks = async (barcodes, systemCache) => {
        if (!barcodes || barcodes.length === 0) {
            return [];
        }

        // Sort barcodes alphabetically to prevent deadlocks
        const sortedBarcodes = [...barcodes].sort();
        const lockKeys = [];
        const LOCK_TIMEOUT = 60; // 60 seconds timeout

        for (const barcode of sortedBarcodes) {
            const lockKey = `${CacheFields.SYSTEM.PRODUCT_SYNC_BARCODE_LOCK}:${barcode}`;
            const lockAcquired = await systemCache.lockWithTimeout(lockKey, LOCK_TIMEOUT);
            
            if (!lockAcquired) {
                // Release all previously acquired locks
                await this.#releaseBarcodeLocks(lockKeys, systemCache);
                return null;
            }
            
            lockKeys.push(lockKey);
        }

        return lockKeys;
    }

    #releaseBarcodeLocks = async (lockKeys, systemCache) => {
        if (!lockKeys || lockKeys.length === 0) {
            return;
        }

        // Release locks in reverse order
        for (let i = lockKeys.length - 1; i >= 0; i--) {
            try {
                await systemCache.unlock(lockKeys[i]);
            } catch (error) {
                this.logger.error(`Error releasing lock ${lockKeys[i]}:`, error);
            }
        }
    }
}