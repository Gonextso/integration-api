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
        this.metafieldKey = SystemCodes.FIND_IN_STORE.METAFIELD_KEY;
    }

    syncMetafieldsForBarcodes = async groupedResults => {
        if (!Array.isArray(groupedResults) || groupedResults.length === 0) {
            return;
        }

        const variantMap = await this.#fetchVariantMapByBarcode();
        if (!variantMap || variantMap.size === 0) {
            this.logger.error("Find in store sync skipped: could not fetch Shopify variants.");
            return;
        }

        await this.#ensureMetafieldDefinition();

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
                key: this.metafieldKey,
                type: "json",
                value: JSON.stringify(item.stores ?? []),
            });
        }

        await this.#setMetafields(metafields);
    }

    fetchBarcodesFromShopify = async () => {
        const variantMap = await this.#fetchVariantMapByBarcode();
        if (!variantMap) {
            return [];
        }

        return [...variantMap.keys()].filter(Boolean);
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

    #ensureMetafieldDefinition = async () => {
        const metafield = `${this.metafieldNamespace}.${this.metafieldKey}`;
        const existingData = await this.api.query(metafieldQueries.definitionsByOwnerType, {
            ownerType: "PRODUCTVARIANT",
        });

        if (existingData.errors) {
            this.logger.error("GraphQL Errors when checking find_in_store metafield definition:", JSON.stringify(existingData.errors));
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
                name: "Find in store",
                namespace: this.metafieldNamespace,
                key: this.metafieldKey,
                description: "Store-level inventory availability from Nebim",
                type: "json",
                ownerType: "PRODUCTVARIANT",
                access: { storefront: "PUBLIC_READ" },
                pin: true,
            },
        };

        const createData = await this.api.query(metafieldMutations.createDefinition, variables);
        if (createData.errors) {
            this.logger.error("GraphQL Errors when creating find_in_store metafield definition:", JSON.stringify(createData.errors));
            return;
        }

        if (createData.data?.metafieldDefinitionCreate?.userErrors?.length) {
            this.logger.error("User Errors when creating find_in_store metafield definition:", JSON.stringify(createData.data.metafieldDefinitionCreate.userErrors));
        }
    }

    #setMetafields = async metafields => {
        const mutation = metafieldMutations.set;
        const batchSize = 25;

        for (let i = 0; i < metafields.length; i += batchSize) {
            const batch = metafields.slice(i, i + batchSize);
            const data = await this.api.query(mutation, { metafields: batch });

            if (!data) {
                this.logger.error("Empty response while setting find_in_store metafields.");
                continue;
            }

            if (data.errors) {
                this.logger.error("GraphQL Errors:", data.errors);
                continue;
            }

            if (data.data?.metafieldsSet?.userErrors?.length) {
                this.logger.error("User Errors when setting find_in_store metafields:", JSON.stringify(data.data.metafieldsSet.userErrors));
            }
        }
    }
}
