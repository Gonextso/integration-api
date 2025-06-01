import CoreClass from "../core/CoreClass.js";

export default class ShopifyObjectHelper extends CoreClass {
    constructor() {
        super();
    }

    static getOrderList = (orderList) => {
        return orderList ? orderList.map(x => {
            console.log(x.lineItems.nodes)
            return {
                shopify_id: x.id,
                order_id: x.name,
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
                lines: [
                    ...x.lineItems.nodes.map(x => ({
                        sku: x.sku,
                        barcode: x.variant?.barcode,
                        quantity: x.quantity,
                        line_discount: Number(x.totalDiscount ?? 0),
                        price: Number(x.originalUnitPrice)
                    }))
                ],
                tags: x.tags
            }
        }) : []
    }
}