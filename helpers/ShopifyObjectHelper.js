import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";

export default class ShopifyObjectHelper extends CoreClass {
    constructor() {
        super();
    }

    static getOrderList = (orderList) => {
        const buildLines = (x) => {
            const fulfillmentLineMap = new Map();

            for (const fo of x.fulfillmentOrders.nodes ?? []) {
                for (const li of fo.lineItems.nodes ?? []) {
                    const barcode = li.lineItem.variant?.barcode;
                    if (barcode && !fulfillmentLineMap.has(barcode)) {
                        fulfillmentLineMap.set(barcode, `${SystemCodes.PREFIXES.SHOPIFY_FULFILLMENT_ORDER_IDS}.${fo.id.replace('gid://shopify/FulfillmentOrder/', '')}.${li.id.replace('gid://shopify/FulfillmentOrderLineItem/', '')}`);
                    }
                }
            }

            return x.lineItems.nodes.map((y) => ({
                sku: y.sku,
                barcode: y.variant?.barcode ?? null,
                quantity: y.refundableQuantity,
                remaining_quantity: y.nonFulfillableQuantity,
                line_discount: Number(y.totalDiscount ?? 0),
                price: Number(y.originalUnitPrice),
                line_id: fulfillmentLineMap.get(y.variant?.barcode ?? null) ?? null,
            }));
        }

        return orderList ? orderList.map(x => {
            return {
                order_id: `${x.name}.${x.id}`,
                order_date: new Date(x.createdAt).toISOString().split('T')[0],
                last_discount: x.totalDiscounts - x.lineItems.nodes.reduce((x, y) => (Number(x.totalDiscount ?? 0) + Number(y.totalDiscount ?? 0)), 0),
                payment: Number(x.netPayment),
                is_receiver_not_customer: x.shippingAddress.name ? x.customer.displayName !== x.shippingAddress.name : false,
                is_cancelled: Boolean(x.cancelReason),
                customer: {
                    first_name: x.customer.firstName,
                    last_name: x.customer.lastName,
                    email: x.customer.email,
                    phone: x.customer.phone,
                    shopify_id: x.customer.id
                },
                address: {
                    first_name: x.shippingAddress.firstName,
                    last_name: x.shippingAddress.lastName,
                    address_text: x.shippingAddress.address1,
                    country: 'TR', //TODO: implement abroad in feature
                    city: x.shippingAddress.city,
                    district: x.shippingAddress.address2,
                },
                lines: buildLines(x),
                tags: x.tags,
                platform: SystemCodes.ECOMMERCE.SHOPIFY
            }
        }) : []
    }

    static getGid = (id, type) => {
        return `gid://shopify/${type}/${id}`;
    }
}