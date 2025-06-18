import storeQueries from "../../models/shopify/queries/store.js";
import storeMutations from "../../models/shopify/mutations/store.js";
import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";

export default class ShopifyStoreBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
    }

    fetchStores = async () => {
        const query = storeQueries.stores;

        const data = await this.api.query(query);

        if (data.errors) {
            this.logger.error('GraphQL Errors:' + data.errors);
            return;
        }

        return data.data.publications.nodes;
    }

    publishProducts = async (productIds, storeIds, publishDate = new Date().toISOString()) => {
        const mutation = storeMutations.publish;
        const responses = [];

        for (const productId of productIds) {
            for (const storeId of storeIds) {   
                const variables = {
                    id: productId,
                    input: {
                        publicationId: storeId,
                        publishDate
                    }
                }

                const data = await this.api.query(mutation, variables);

                if (data.errors) {
                    this.logger.error('GraphQL Errors:', JSON.stringify(data.errors));
                    return;
                }

                responses.push(data.data)
            }
        }

        return responses;
    }

    fetchLocations = async (onlyPrimaries = true) => {
        const query = storeQueries.locations;

        const data = await this.api.query(query);

        if (data.errors) {
            this.logger.error('GraphQL Errors:' + data.errors);
            return;
        }

        return data.data.locations.edges.filter(x => onlyPrimaries ? x.node.isPrimary === true : true);
    }

    checkStore = async _ => {
        await this.api.query(storeQueries.dummy);
    }
}