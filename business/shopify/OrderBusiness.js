import orderQueries from "../../models/shopify/queries/order.js";
import orderMutations from "../../models/shopify/mutations/order.js";
import ShopifyObjectHelper from "../../helpers/ShopifyObjectHelper.js";
import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";
import SystemCodes from "../../enums/SystemCodes.js";
import SuccessOrder from "../../models/db/SuccessOrder.js";

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

    getOrdersByIds = async (orderIds = []) => {
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return [];
        }

        const MAX_IDS_PER_CALL = 250;
        const normalizeId = (id) =>
            (typeof id === "string" && id.startsWith("gid://shopify/Order/"))
                ? id
                : `gid://shopify/Order/${id}`;

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


    updateErpMetadataForOrders = async (orderMappings = [], namespace = 'gonextso_nebim_app', key = 'order_id') => {
        if (!Array.isArray(orderMappings) || orderMappings.length === 0) {
            return [];
        }

        const orderErpMappings = orderMappings.map(mapping => ({
            orderId: mapping.ecommerceId,
            erpId: mapping.erpId
        }));

        return await this.sendErpIdsToMetadataBatch(orderErpMappings, namespace, key);
    }

    sendErpIdToMetadata = async (orderId, erpId, namespace = 'gonextso_nebim_app', key = 'order_id') => {
        try {
            const normalizedOrderId = orderId.startsWith('gid://shopify/Order/')
                ? orderId
                : `gid://shopify/Order/${orderId}`;

            const orderUpdateInput = {
                id: normalizedOrderId,
                metafields: [
                    {
                        namespace: namespace,
                        key: key,
                        value: erpId,
                        type: 'single_line_text_field'
                    }
                ]
            };

            const data = await this.api.query(orderMutations.updateOrderWithMetafields, {
                input: orderUpdateInput
            });

            if (data.errors) {
                this.logger.error('GraphQL Errors when updating order metafields:', data.errors);
                this.throws(`Failed to update order metafields: ${data.errors[0]?.message || 'Unknown error'}`);
            }

            if (data.data?.orderUpdate?.userErrors?.length > 0) {
                const userErrors = data.data.orderUpdate.userErrors;
                this.logger.error('User errors when updating order metafields:', userErrors);
                this.throws(`Order update failed: ${userErrors[0]?.message || 'Unknown error'}`);
            }

            this.logger.info2(`Successfully set ERP ID metadata for order ${orderId}: ${erpId}`);

            return {
                success: true,
                order: data.data?.orderUpdate?.order,
                orderId: orderId,
                erpId: erpId
            };

        } catch (error) {
            this.logger.error(`Error setting ERP ID metadata for order ${orderId}:`, error);
            this.throws(`Error setting ERP ID metadata for order ${orderId}: ${error.message}`);
        }
    }

    sendErpIdsToMetadataBatch = async (orderErpMappings, namespace = 'gonextso_nebim_app', key = 'order_id') => {
        const results = [];

        for (const mapping of orderErpMappings) {
            try {
                const result = await this.sendErpIdToMetadata(
                    mapping.orderId,
                    mapping.erpId,
                    namespace,
                    key
                );
                results.push({ ...result, orderId: mapping.orderId });
            } catch (error) {
                results.push({
                    success: false,
                    orderId: mapping.orderId,
                    error: error.message
                });
            }
        }

        return results;
    }

    //TODO: use it on order status shipped
    updateOrderFullfillmentStatus = async (orders = {}) => {
        if (!orders || Object.keys(orders).length === 0) {
            return [];
        }

        const results = [];

        for (const order of Object.values(orders)) {
            try {
                const successOrder = await SuccessOrder.findOne({ erpId: order.erpId, tenant: this.tenant._id });
                if (!successOrder) {
                    results.push({ success: false, orderId: order.ecommerceId, error: 'No synced success order found for this order.' });
                    continue;
                }

                const fulfillmentOrdersResp = await this.api.query(orderQueries.fulfillmentOrdersByOrderId, { orderId: order.ecommerceId.split('.')[1].toLowerCase().replace('gid://shopify/order/', 'gid://shopify/Order/') });
                if (fulfillmentOrdersResp.errors) {
                    this.logger.error(new Error(`GraphQL Errors when fetching fulfillment orders: ${JSON.stringify(fulfillmentOrdersResp.errors)}`));
                    results.push({ success: false, orderId: order.ecommerceId, error: fulfillmentOrdersResp.errors[0]?.message || 'Unknown error' });
                    continue;
                }
                const fulfillmentOrders = fulfillmentOrdersResp.data?.order?.fulfillmentOrders?.nodes || [];
                if (fulfillmentOrders.length === 0) {
                    results.push({ success: false, orderId: order.ecommerceId, error: 'No fulfillment orders found for this order.' });
                    continue;
                }

                const fulfillmentOrder = fulfillmentOrders[0];

                const lineItemsByFulfillmentOrder = Object.keys(order.tracking).map(x => ({
                    temp_tracking_number: x,
                    fulfillmentOrderId: fulfillmentOrder.id,
                    fulfillmentOrderLineItems: fulfillmentOrder.lineItems.nodes.filter(li => order.tracking[x].fullFillmentIds.split('.').includes(li.id.replace('gid://shopify/FulfillmentOrderLineItem/', '')) && order.tracking[x].fullFillmentIds.split('.').includes(fulfillmentOrder.id.replace('gid://shopify/FulfillmentOrder/', ''))).map(li => ({
                        id: li.id,
                        quantity: order.tracking[x].lines.reduce((sum, line) => sum + (line.shippedQuantity || 0), 0)
                    }))
                }));

                for (const info of lineItemsByFulfillmentOrder) {
                    const trackingInfo = {
                        number: info.temp_tracking_number,
                        url: order.tracking[info.temp_tracking_number]?.url
                    }

                    delete info.temp_tracking_number;

                    const fulfillment = {
                        lineItemsByFulfillmentOrder: [info],
                        notifyCustomer: false //TODO: notify customer should come from tenant option
                    };

                    if (trackingInfo.number !== SystemCodes.DEFINITIONS.NO_TRACKING_NUMBER) {
                        fulfillment.trackingInfo = trackingInfo;
                    }

                    const mutationResp = await this.api.query(orderMutations.fulfillmentCreate, { fulfillment });
                    if (mutationResp.errors) {
                        this.logger.error(new Error(`GraphQL Errors when creating fulfillment: ${JSON.stringify(mutationResp.errors)}`));
                        results.push({ success: false, orderId: order.ecommerceId, error: mutationResp.errors[0]?.message || 'Unknown error' });
                        continue;
                    }
                    const userErrors = mutationResp.data?.fulfillmentCreate?.userErrors;
                    if (userErrors && userErrors.length > 0) {
                        this.logger.error(new Error(`User errors when creating fulfillment: ${JSON.stringify(userErrors)}`));
                        results.push({ success: false, orderId: order.ecommerceId, error: userErrors[0]?.message || 'Unknown error' });
                        continue;
                    }

                    results.push({ success: true, orderId: order.ecommerceId, fulfillment: mutationResp.data?.fulfillmentCreate?.fulfillment });
                }
            } catch (error) {
                this.logger.error(new Error(`Error updating fulfillment for order: ${order.ecommerceId}`, error));
                results.push({ success: false, orderId: order.ecommerceId, error: error.message });
            }
        }

        return results;
    }
}

//TODO: mark synced statuses