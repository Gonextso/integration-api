import orderQueries from "../../models/shopify/queries/order.js";
import ShopifyObjectHelper from "../../helpers/ShopifyObjectHelper.js";
import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";

export default class ShopifyOrderBusiness extends CoreClass {
    constructor(shopifyConfig) {
        super();
        this.api = new ShopifyGqlAPI(shopifyConfig);
    }

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
}