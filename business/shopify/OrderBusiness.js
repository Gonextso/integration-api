import orderQueries from "../../models/shopify/queries/order.js";
import orderMutations from "../../models/shopify/mutations/order.js";
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

    /**
     * Update ERP ID metadata for Shopify orders using ecommerceId (Shopify order ID) and erpId (ERP order ID)
     * @param {Array<Object>} orderMappings - Array of objects with ecommerceId (Shopify order ID) and erpId (ERP order ID)
     * @param {string} namespace - Metadata namespace (default: 'erp')
     * @param {string} key - Metadata key (default: 'id')
     * @returns {Promise<Array>} - Results of metadata update operations
     */
    updateErpMetadataForOrders = async (orderMappings = [], namespace = 'erp', key = 'id') => {
        if (!Array.isArray(orderMappings) || orderMappings.length === 0) {
            return [];
        }

        // Transform the mappings to use ecommerceId as orderId
        const orderErpMappings = orderMappings.map(mapping => ({
            orderId: mapping.ecommerceId, // Shopify order ID
            erpId: mapping.erpId // ERP order ID
        }));

        return await this.sendErpIdsToMetadataBatch(orderErpMappings, namespace, key);
    }

    /**
     * Get orders by IDs and update their ERP metadata using ecommerceId and erpId mappings
     * @param {Array<Object>} orderMappings - Array of objects with ecommerceId (Shopify order ID) and erpId (ERP order ID)
     * @param {string} namespace - Metadata namespace (default: 'erp')
     * @param {string} key - Metadata key (default: 'id')
     * @returns {Promise<Object>} - Object containing orders and metadata update results
     */
    getOrdersAndUpdateErpMetadata = async (orderMappings = [], namespace = 'erp', key = 'id') => {
        if (!Array.isArray(orderMappings) || orderMappings.length === 0) {
            return { orders: [], metadataResults: [] };
        }

        // Extract ecommerceIds (Shopify order IDs) for fetching orders
        const ecommerceIds = orderMappings.map(mapping => mapping.ecommerceId);
        
        // Fetch orders
        const orders = await this.getOrdersByIds(ecommerceIds);
        
        // Update ERP metadata
        const metadataResults = await this.updateErpMetadataForOrders(orderMappings, namespace, key);
        
        return {
            orders: orders,
            metadataResults: metadataResults
        };
    }

    /**
     * Sends ERP ID to Shopify order metadata
     * @param {string} orderId - Shopify order ID (can be with or without gid://shopify/Order/ prefix)
     * @param {string} erpId - ERP system ID to store in metadata
     * @param {string} namespace - Metadata namespace (default: 'erp')
     * @param {string} key - Metadata key (default: 'id')
     * @returns {Promise<Object>} - Result of the metadata update operation
     */
    sendErpIdToMetadata = async (orderId, erpId, namespace = 'erp', key = 'id') => {
        try {
            // Normalize order ID to include gid://shopify/Order/ prefix if not present
            const normalizedOrderId = orderId.startsWith('gid://shopify/Order/') 
                ? orderId 
                : `gid://shopify/Order/${orderId}`;

            // Prepare order update input with metafields
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

            // Execute the orderUpdate mutation with metafields
            const data = await this.api.query(orderMutations.updateOrderWithMetafields, {
                input: orderUpdateInput
            });

            if (data.errors) {
                this.logger.error('GraphQL Errors when updating order metafields:', data.errors);
                throw new Error(`Failed to update order metafields: ${data.errors[0]?.message || 'Unknown error'}`);
            }

            if (data.data?.orderUpdate?.userErrors?.length > 0) {
                const userErrors = data.data.orderUpdate.userErrors;
                this.logger.error('User errors when updating order metafields:', userErrors);
                throw new Error(`Order update failed: ${userErrors[0]?.message || 'Unknown error'}`);
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
            throw error;
        }
    }

    /**
     * Batch update ERP IDs for multiple orders
     * @param {Array<Object>} orderErpMappings - Array of objects with orderId and erpId
     * @param {string} namespace - Metadata namespace (default: 'erp')
     * @param {string} key - Metadata key (default: 'id')
     * @returns {Promise<Array>} - Results of all metadata update operations
     */
    sendErpIdsToMetadataBatch = async (orderErpMappings, namespace = 'erp', key = 'id') => {
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
}