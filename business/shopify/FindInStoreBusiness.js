import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";
import SystemCodes from "../../enums/SystemCodes.js";
import inventoryQueries from "../../models/shopify/queries/inventory.js";
import metafieldQueries from "../../models/shopify/queries/metafield.js";
import metafieldMutations from "../../models/shopify/mutations/metafield.js";

export default class ShopifyFindInStoreBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.metafieldNamespace = SystemCodes.FIND_IN_STORE.METAFIELD_NAMESPACE;
        this.storesMetafieldKey = SystemCodes.FIND_IN_STORE.STORES_METAFIELD_KEY;
        this.inventoryMetafieldKey = SystemCodes.FIND_IN_STORE.INVENTORY_METAFIELD_KEY;
    }

    syncStoresMetafieldIfChanged = async stores => {
        if (!Array.isArray(stores)) {
            return;
        }

        await this.#ensureStoresMetafieldDefinition();

        const shopData = await this.api.query(metafieldQueries.shopMetafield, {
            namespace: this.metafieldNamespace,
            key: this.storesMetafieldKey,
        });

        if (shopData?.errors) {
            this.logger.error("GraphQL Errors when reading stores metafield:", JSON.stringify(shopData.errors));
            return;
        }

        const shopId = shopData?.data?.shop?.id;
        if (!shopId) {
            this.logger.error("Find in store: could not resolve Shopify shop id.");
            return;
        }

        const nextValue = this.#normalizeStoresJson(stores);
        const currentRaw = shopData?.data?.shop?.metafield?.value;
        const currentValue = this.#parseStoresJson(currentRaw);

        if (currentValue === nextValue) {
            this.logger.info2("Find in store: stores metafield unchanged, skipping update.");
            return;
        }

        await this.#setMetafields([{
            ownerId: shopId,
            namespace: this.metafieldNamespace,
            key: this.storesMetafieldKey,
            type: "json",
            value: nextValue,
        }]);
    }

    syncVariantInventoryForBarcodes = async (groupedResults, variantMap) => {
        if (!Array.isArray(groupedResults) || groupedResults.length === 0) {
            return;
        }

        if (!variantMap || variantMap.size === 0) {
            this.logger.error("Find in store sync skipped: empty variant map.");
            return;
        }

        await this.#ensureInventoryMetafieldDefinition();

        const metafields = [];
        for (const item of groupedResults) {
            const variantId = variantMap.get(item.barcode);
            if (!variantId) {
                this.logger.info2(`Find in store: Shopify variant not found for barcode ${item.barcode}`);
                continue;
            }

            metafields.push({
                ownerId: variantId,
                namespace: this.metafieldNamespace,
                key: this.inventoryMetafieldKey,
                type: "json",
                value: JSON.stringify(item.stores ?? []),
            });
        }

        await this.#setMetafields(metafields);
    }

    fetchVariantMapByBarcode = async () => this.#fetchVariantMapByBarcode();

    fetchBarcodesFromShopify = async () => {
        const variantMap = await this.#fetchVariantMapByBarcode();
        if (!variantMap) {
            return [];
        }

        return [...variantMap.keys()].filter(Boolean);
    }

    #normalizeStoresJson = stores => JSON.stringify(
        [...stores]
            .filter(store => store?.desc)
            .sort((a, b) => a.desc.localeCompare(b.desc))
    );

    #parseStoresJson = rawValue => {
        if (!rawValue) {
            return this.#normalizeStoresJson([]);
        }

        try {
            const parsed = JSON.parse(rawValue);
            return this.#normalizeStoresJson(Array.isArray(parsed) ? parsed : []);
        } catch {
            return null;
        }
    }

    #fetchVariantMapByBarcode = async () => {
        const query = inventoryQueries.inventory;
        const variantMap = new Map();
        let hasNextPage = true;
        let endCursor = null;

        while (hasNextPage) {
            const data = await this.api.query(query, { cursor: endCursor });
            if (!data) {
                this.logger.error("Empty response while fetching Shopify variants for find in store.");
                return null;
            }

            if (data.errors) {
                this.logger.error("GraphQL Errors:", data.errors);
                return null;
            }

            const inventories = data?.data?.inventoryItems;
            if (!inventories || !Array.isArray(inventories.edges)) {
                this.logger.error("Invalid inventory response payload from Shopify.", data);
                return null;
            }

            for (const { node } of inventories.edges) {
                const barcode = node?.variant?.barcode;
                const variantId = node?.variant?.id;
                if (barcode && variantId) {
                    variantMap.set(barcode, variantId);
                }
            }

            hasNextPage = inventories.pageInfo.hasNextPage;
            if (hasNextPage) {
                endCursor = inventories.edges[inventories.edges.length - 1].cursor;
            }
        }

        return variantMap;
    }

    #ensureMetafieldDefinition = async (ownerType, metafieldKey, name, description) => {
        const metafield = `${this.metafieldNamespace}.${metafieldKey}`;
        const existingData = await this.api.query(metafieldQueries.definitionsByOwnerType, {
            ownerType,
        });

        if (existingData.errors) {
            this.logger.error(`GraphQL Errors when checking ${metafieldKey} metafield definition:`, JSON.stringify(existingData.errors));
            return;
        }

        const existingDefinition = existingData.data.metafieldDefinitions.edges.find(
            edge => `${edge.node.namespace}.${edge.node.key}` === metafield
        );

        if (existingDefinition?.node?.type?.name === "json") {
            return;
        }

        const variables = {
            definition: {
                name,
                namespace: this.metafieldNamespace,
                key: metafieldKey,
                description,
                type: "json",
                ownerType,
                access: { storefront: "PUBLIC_READ" },
                pin: true,
            },
        };

        const createData = await this.api.query(metafieldMutations.createDefinition, variables);
        if (createData.errors) {
            this.logger.error(`GraphQL Errors when creating ${metafieldKey} metafield definition:`, JSON.stringify(createData.errors));
            return;
        }

        if (createData.data?.metafieldDefinitionCreate?.userErrors?.length) {
            this.logger.error(`User Errors when creating ${metafieldKey} metafield definition:`, JSON.stringify(createData.data.metafieldDefinitionCreate.userErrors));
        }
    }

    #ensureStoresMetafieldDefinition = async () => this.#ensureMetafieldDefinition(
        "SHOP",
        this.storesMetafieldKey,
        "Stores",
        "Store master data from Nebim for find in store"
    );

    #ensureInventoryMetafieldDefinition = async () => this.#ensureMetafieldDefinition(
        "PRODUCTVARIANT",
        this.inventoryMetafieldKey,
        "find_in_store",
        "Per-variant store inventory from Nebim"
    );

    #setMetafields = async metafields => {
        if (!metafields.length) {
            return;
        }

        const mutation = metafieldMutations.set;
        const batchSize = 25;

        for (let i = 0; i < metafields.length; i += batchSize) {
            const batch = metafields.slice(i, i + batchSize);
            const data = await this.api.query(mutation, { metafields: batch });

            if (!data) {
                this.logger.error("Empty response while setting find in store metafields.");
                continue;
            }

            if (data.errors) {
                this.logger.error("GraphQL Errors:", data.errors);
                continue;
            }

            if (data.data?.metafieldsSet?.userErrors?.length) {
                this.logger.error("User Errors when setting find in store metafields:", JSON.stringify(data.data.metafieldsSet.userErrors));
            }
        }
    }
}
