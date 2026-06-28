import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";
import SystemCodes from "../../enums/SystemCodes.js";
import marketQueries from "../../models/shopify/queries/market.js";
import priceListMutations from "../../models/shopify/mutations/priceList.js";

export default class ShopifyMarketPriceBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.priceBatchSize = SystemCodes.MARKET_SYNC.PRICE_BATCH_SIZE;
    }

    /**
     * Returns Map<CURRENCY_CODE, { priceListId, name, currency }>.
     * When multiple price lists share a currency, an ACTIVE catalog wins; otherwise the first seen.
     */
    fetchPriceListsByCurrency = async () => {
        const byCurrency = new Map();
        let hasNextPage = true;
        let cursor = null;

        while (hasNextPage) {
            const data = await this.api.query(marketQueries.priceLists, { cursor });
            if (!data || data.errors) {
                this.logger.error("GraphQL Errors while fetching price lists:", JSON.stringify(data?.errors ?? data));
                break;
            }

            const connection = data?.data?.priceLists;
            if (!connection || !Array.isArray(connection.edges)) {
                this.logger.error("Invalid priceLists response payload from Shopify.", JSON.stringify(data));
                break;
            }

            for (const { node } of connection.edges) {
                const currency = node?.currency ? String(node.currency).toUpperCase() : null;
                if (!currency || !node?.id) continue;

                const existing = byCurrency.get(currency);
                const isActive = node?.catalog?.status === "ACTIVE";
                if (!existing || (isActive && existing.catalogStatus !== "ACTIVE")) {
                    byCurrency.set(currency, {
                        priceListId: node.id,
                        name: node.name,
                        currency,
                        catalogStatus: node?.catalog?.status ?? null,
                    });
                }
            }

            hasNextPage = connection.pageInfo?.hasNextPage === true;
            cursor = hasNextPage ? connection.edges[connection.edges.length - 1]?.cursor : null;
        }

        return byCurrency;
    }

    /**
     * Adds fixed prices to a price list (per currency).
     * prices: Array<{ variantId, amount, compareAmount }>.
     * Returns { success, error }.
     */
    addFixedPrices = async (priceListId, currencyCode, prices) => {
        const valid = (prices ?? []).filter(p => p?.variantId && p.amount != null && !Number.isNaN(Number(p.amount)));
        if (!valid.length) {
            return { success: 0, error: 0 };
        }

        let success = 0;
        let error = 0;

        for (let i = 0; i < valid.length; i += this.priceBatchSize) {
            const batch = valid.slice(i, i + this.priceBatchSize);
            const variables = {
                priceListId,
                prices: batch.map(p => {
                    const input = {
                        variantId: p.variantId,
                        price: { amount: String(p.amount), currencyCode },
                    };
                    if (p.compareAmount != null && !Number.isNaN(Number(p.compareAmount))) {
                        input.compareAtPrice = { amount: String(p.compareAmount), currencyCode };
                    }
                    return input;
                }),
            };

            const data = await this.api.query(priceListMutations.fixedPricesAdd, variables);
            const userErrors = data?.data?.priceListFixedPricesAdd?.userErrors ?? [];

            if (!data || data.errors || userErrors.length) {
                error += batch.length;
                this.logger.error(
                    `priceListFixedPricesAdd failed for ${currencyCode} (${priceListId}): ${JSON.stringify(data?.errors ?? userErrors)}`
                );
            } else {
                success += batch.length;
            }
        }

        return { success, error };
    }
}
