import orderQueries from "../../models/shopify/queries/order.js";
import ShopifyObjectHelper from "../../helpers/ShopifyObjectHelper.js";
import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";

export default class ShopifyOrderBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
    }

    //TODO: 1002 siparişi neden geliyor incele iade edilmiş
    getOrders = async (startDate, endDate) => {
        const query = orderQueries.openOrders;

        let hasNextPage = true;
        let endCursor = null;
        const allOrders = [];

        while (hasNextPage) {
            const variables = {
                cursor: endCursor
            };

            const data = await this.api.query(query.replace('@start_date', startDate).replace('@end_date', endDate), variables);

            if (data.errors) {
                this.logger.error('GraphQL Errors:', data.errors);
                return;
            }

            const orders = data.data.orders;

            orders.edges.forEach(({ node }) => {
                allOrders.push(node);
            });

            hasNextPage = orders.pageInfo.hasNextPage;
            if (hasNextPage) {
                endCursor = orders.edges[orders.edges.length - 1].cursor;
            }
        }

        return ShopifyObjectHelper.getOrderList(allOrders);
    }

    /**
     * Fetch specific orders by their numeric IDs.
     * Shopify’s GraphQL Admin API accepts up to 250 IDs per call,
     * so we break the request into pages (“chunks”) when needed.
     *
     * @param {(number|string)[]} orderIds - array of Shopify order IDs (numeric or GID)
     * @returns {Promise<Array>}  - normalized order list
     */
    getOrdersByIds = async (orderIds = []) => {
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return [];
        }

        const MAX_IDS_PER_CALL = 250;
        const normalizeId = (id) =>
            (typeof id === "string" && id.startsWith("gid://shopify/Order/"))
                ? id
                : `gid://shopify/Order/${id}`;

        // Split the incoming array into chunks of 250
        const chunks = [];
        for (let i = 0; i < orderIds.length; i += MAX_IDS_PER_CALL) {
            chunks.push(orderIds.slice(i, i + MAX_IDS_PER_CALL));
        }

        const allOrders = [];

        for (const chunk of chunks) {
            const gids = chunk.map(normalizeId);
            const variables = { ids: gids };

            const data = await this.api.query(orderQueries.orderByIds, variables);

            if (data.errors) {
                this.logger.error("GraphQL Errors:", data.errors);
                continue;
            }

            const nodes = data.data?.nodes ?? [];

            nodes.forEach((node) => {
                if (node) {
                    allOrders.push(node);
                }
            });
        }

        return ShopifyObjectHelper.getOrderList(allOrders);
    }
}