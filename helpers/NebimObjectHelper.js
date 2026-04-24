import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import ProductDetail from "../models/ProductDetail.js";
import ProductInventory from "../models/ProductInventory.js";

export default class NebimObjectHelper extends CoreClass {
    static getDetailList = (detailList, priceList, tenant) => {
        const products = new Map();
        const prices = {};

        for (const row of priceList) {
            prices[row.Barcode] = {
                barcode: row.Barcode,
                base_price: row.Price,
                sale_price: row.SellPrice,
                currency: row.CurrencyCode
            };
        }

        for (const row of detailList) {
            let product = null;

            if (products.has(row.ItemCode)) {
                product = products.get(row.ItemCode)
            }

            let categoryName = ''

            for (const key in row) {
                if (tenant.nebim.product.categoryKeysFrom.includes(key)) {
                    categoryName += row[key] + " "
                }
            }

            if (!product) {
                product = new ProductDetail({
                    erp_id: row.ItemCode,
                    title: row.ItemDescription,
                    category: categoryName.trim(),
                    tax_rate: row.VatRate,
                    attributes: Object.keys(row).map(x => (x.includes('Att') && !x.includes('Color') && !x.includes('Desc') && row[x]) ? { id: x, code: row[x], title: row[`${x}Desc`] } : null).filter(Boolean),
                    variants: []
                });
            }

            const sku = tenant.shopify.skuFields.nebim.fields.map(x => row[x]).join(tenant.shopify.skuFields.nebim.separator);

            product.addVariants({
                barcode: row.Barcode,
                color: row.ColorDescription,
                dimention: row.ItemDim1Code,
                sku: sku,
                is_blocked_by_erp: !row.UseInternet || row.IsBlocked,
                ...prices[row.Barcode]
            });

            products.delete(row.ItemCode);
            products.set(row.ItemCode, product);
        }

        return [...products.values()];
    }

    static getInventories = inventoryList => inventoryList.map(x => new ProductInventory({
        barcode: x.Barcode,
        quantity: x.Inventory > 0 ? x.Inventory : 0
    }));

    static toNebimOrder = (tenant, order, customer) => {
        const shippingPayment = Number(order.shipping_payment ?? 0);
        const cargoItemCode = (tenant.nebim?.cargoItemCode ?? tenant.nebim?.order?.cargoItemCode ?? "").toString().trim();
        const isCargoService = Boolean(tenant.nebim?.isCargoService ?? tenant.nebim?.order?.isCargoService);
        const lines = order.lines.map(x => ({
            UsedBarcode: x.barcode,
            PriceVI: x.price,
            Qty1: x.quantity,
            LineDescription: x.line_id,
            LDiscountVI4: x.line_discount
        }));

        if (shippingPayment > 0) {
            if (!cargoItemCode) {
                throw new Error(`Cargo item code is required when shipping payment exists for order ${order.order_id}`);
            }

            lines.push({
                ItemTypeCode: isCargoService ? "5" : "1",
                ItemCode: cargoItemCode,
                Qty1: 1,
                PriceVI: shippingPayment
            });
        }

        return {
            ModelType: 6,
            ...customer,
            PosTerminalID: tenant.nebim.order.posTerminalId,
            OfficeCode: tenant.nebim.order.office,
            StoreCode: tenant.nebim.order.store,
            CompanyCode: tenant.nebim.order.company,
            StoreWarehouseCode: tenant.nebim.order.warehouse,
            OrderDate: order.order_date,
            DocumentNumber: order.order_id,
            Description: `shopify_info:${order.order_id}${order.tags ? '; tags: ' : ''}${order.tags.join(', ')}`,
            DeliveryCompanyCode: tenant.nebim.order.deliveryCompanyCode,
            ShipmentMethodCode: 2,
            IsCompleted: true,
            IsSalesViaInternet: true,
            OrdersViaInternetInfo: {
                SalesUrl: tenant.nebim?.salesUrl,
                PaymentTypeCode: 1,
                PaymentTypeDescription: "KREDIKARTI/BANKAKARTI",
                PaymentAgent: "",
                PaymentDate: order.order_date,
                SendDate: order.order_date
            },
            Lines: lines,
            Payments: [{
                PaymentType: 2,
                CreditCardTypeCode: tenant.nebim.order.creditCardType,
                CurrencyCode: "TRY", //TODO: add multi currency support
                InstallmentCount: 1,
                Amount: order.payment
            }]
        };
    }

    static toNebimCancelOrder = (tenant, createdOrder) => ({
        ModelType: 34,
        OrderNumber: createdOrder.erpId,
        Lines: createdOrder.lines.map(x => ({
            LineID: x.erpLineId,
            Qty1: x.quantity,
            OrderCancelReasonCode: tenant.nebim.order.cancelReason
        })),
        Payments: [{
            PaymentType: 2,
            CreditCardTypeCode: tenant.nebim.order.creditCardType,
            CurrencyCode: "TRY", //TODO: add multi currency support
            InstallmentCount: 1,
            Amount: createdOrder.lines.reduce((sum, line) => sum + (line.amount), 0) ?? 0
        }]
    })

    static getOrderStatusList = nebimOrderStatusList => {
        const orders = {};

        for (const row of nebimOrderStatusList) {
            if (!(row.Status.toUpperCase() === SystemCodes.NEBIM_ORDER_STATUS.INVOICED || row.Status.toUpperCase() === SystemCodes.NEBIM_ORDER_STATUS.ON_CARGO)) {
                continue;
            }

            if (!orders[row.DocNumber]) {
                orders[row.DocNumber] = {
                    erpId: row.OrderRefNumber,
                    ecommerceId: row.DocNumber,
                    tracking: {},
                    status: row.Status
                }
            }

            if (!orders[row.DocNumber].tracking[row.TrackingNumber ?? SystemCodes.DEFINITIONS.NO_TRACKING_NUMBER]) {
                orders[row.DocNumber].tracking[row.TrackingNumber ?? SystemCodes.DEFINITIONS.NO_TRACKING_NUMBER] = {
                    number: row.TrackingNumber ?? SystemCodes.DEFINITIONS.NO_TRACKING_NUMBER,
                    url: row.TrackingUrl,
                    fullFillmentIds: row.LineDescription,
                    lines: []
                }
            } 
            
            orders[row.DocNumber].tracking[row.TrackingNumber ?? SystemCodes.DEFINITIONS.NO_TRACKING_NUMBER]?.lines.push({
                erpLineId: row.OrderLineID,
                orderQuantity: row.OrderQty,
                shippedQuantity: row.InvoiceQty ?? row.ShipmentQty ?? 0
            })

        }

        return orders
    }
}