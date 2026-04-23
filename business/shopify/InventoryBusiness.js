import inventoryMutations from "../../models/shopify/mutations/inventory.js";
import inventoryQueries from "../../models/shopify/queries/inventory.js";
import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";
import StoreBusiness from "./StoreBusiness.js";

export default class ShopifyInventoryBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.store = new StoreBusiness(tenant);
    }

    syncInventoryBulk = async (inventoryList) => {
        const ids = await this.#fetchInventoryIds();
        if (!Array.isArray(ids) || ids.length === 0) {
            this.logger.error("Inventory sync skipped: could not fetch Shopify inventory IDs.");
            return;
        }

        const locations = await this.store.fetchLocations();
        const locationId = locations?.[0]?.node?.id;
        if (!locationId) {
            this.logger.error("Inventory sync skipped: no Shopify location found.");
            return;
        }

        await this.#setInventory(ids, inventoryList, locationId);
    }

    #fetchInventoryIds = async () => {
        const query = inventoryQueries.inventory;
        const allInventories = [];
        let hasNextPage = true;
        let endCursor = null;

        while (hasNextPage) {
            const variables = {
                cursor: endCursor,
            };

            const data = await this.api.query(query, variables);
            if (!data) {
                this.logger.error("Empty response while fetching Shopify inventory IDs.");
                return null;
            }

            if (data.errors) {
                this.logger.error('GraphQL Errors:', data.errors);
                return null;
            }

            const inventories = data?.data?.inventoryItems;
            if (!inventories || !Array.isArray(inventories.edges)) {
                this.logger.error("Invalid inventory response payload from Shopify.", data);
                return null;
            }

            inventories.edges.forEach(({ node }) => {
                allInventories.push(node);
            });

            hasNextPage = inventories.pageInfo.hasNextPage;
            if (hasNextPage) {
                endCursor = inventories.edges[inventories.edges.length - 1].cursor;
            }
        }

        return allInventories.map(x => ({ id: x.id, sku: x.sku, barcode: x.variant.barcode }));
    }

    #setInventory = async (shopifyInventoryItems, inventories, locationId) => {
        const mutation = inventoryMutations.set;
        const unSetInventories = [];
        const batchSize = 250;
        const dataResults = [];

        let batchQuantities = [];

        const flushBatch = async () => {
            if (batchQuantities.length === 0) return;

            const variables = {
                input: {
                    ignoreCompareQuantity: true,
                    name: "available",
                    reason: "correction",
                    quantities: batchQuantities,
                },
            };

            const data = await this.api.query(mutation, variables);

            if (!data) {
                this.logger.error("Empty response while setting Shopify inventory.");
            } else if (data.errors) {
                this.logger.error("GraphQL Errors:", data.errors);
            } else {
                dataResults.push(data.data);
            }

            batchQuantities = [];
        };

        for (const inventory of inventories) {
            const shopifyInventoryItem = shopifyInventoryItems.find(
                (item) => item.barcode === inventory.barcode
            );

            if (!shopifyInventoryItem) {
                unSetInventories.push({
                    ...inventory,
                    reason: "Shopify inventory ID not found",
                });
                continue;
            }

            batchQuantities.push({
                inventoryItemId: shopifyInventoryItem.id,
                quantity: inventory.quantity,
                locationId,
            });

            if (batchQuantities.length === batchSize && batchQuantities.length > 0) {
                await flushBatch();
            }
        }

        await flushBatch();

        return {
            data: dataResults,
            unSetInventories,
        };
    }
}

//TODO: boş istekler gidiyor bulk istek bakılmalı
