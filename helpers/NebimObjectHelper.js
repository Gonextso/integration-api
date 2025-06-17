import CoreClass from "../core/CoreClass.js";
import ProductDetail from "../models/ProductDetail.js";
import ProductInventory from "../models/ProductInventory.js";

export default class NebimObjectHelper extends CoreClass {
    static getDetailList = (detailList, priceList, categoryKeysFrom) => {
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
                if (categoryKeysFrom.includes(key)) {
                    categoryName += row[key] + " "
                }
            }

            if (!product) {
                product = new ProductDetail({
                    erp_id: row.ItemCode,
                    title: row.ItemDescription,
                    category: categoryName.trim(),
                    tax_rate: row.VatRate,
                    is_blocked_by_erp: !row.UseInternet || row.IsBlocked,
                    attributes: [...Object.keys(row).map(x => (x.includes('Att') && !x.includes('Desc') && row[x]) ? { id: x, code: row[x], title: row[`${x}Desc`] } : null)].filter(x => x),
                    variants: []
                });
            }

            product.addVariants({
                barcode: row.Barcode,
                color: row.ColorDescription,
                dimention: row.ItemDim1Code,
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

    static toNebimOrder = (tenant, order, customer) => ({
        ModelType: 6,
        ...customer,
        PosTerminalID: tenant.nebim.order.posTerminalId,
        OfficeCode: tenant.nebim.order.office,
        StoreCode: tenant.nebim.order.store,
        StoreWarehouseCode: tenant.nebim.order.warehouse,
        OrderDate: order.order_date,
        DocumentNumber: order.order_id,
        Description: `shopifyId_${order.shopify_id}${order.tags ? '; tags: ' : ''}${order.tags.join(', ')}`,
        DeliveryCompanyCode: tenant.nebim.order.deliveryCompanyCode,
        ShipmentMethodCode: 2,
        IsCompleted: true,
        IsSalesViaInternet: true,
        OrdersViaInternetInfo: {
            SalesUrl: tenant.salesUrl,
            PaymentTypeCode: 1,
            PaymentTypeDescription: "KREDIKARTI/BANKAKARTI",
            PaymentAgent: "",
            PaymentDate: order.order_date,
            SendDate: order.order_date
        },
        Lines: order.lines.map(x => ({
            UsedBarcode: x.barcode,
            PriceVI: x.price,
            Qty1: x.quantity,
            LDiscount4: x.line_discount
        })),
        Payments: [{
            PaymentType: 2,
            CreditCardTypeCode: tenant.nebim.order.creditCardType,
            CurrencyCode: "TRY", //TODO: add multi currency support
            InstallmentCount: 1,
            Amount: order.payment
        }]
    })

    static toNebimCancelOrder = (tenant, order) => ({
        ModelType: 34,
        OrderNumber: order.erpId,
        Lines: order.lines.map(x => ({
            LineID: x.erpLineId,
            Qty1: x.quantity,
            OrderCancelReasonCode: tenant.nebim.order.cancelReason
        })),
        Payments: [{
            PaymentType: 2,
            CreditCardTypeCode: tenant.nebim.order.creditCardType,
            CurrencyCode: "TRY", //TODO: add multi currency support
            InstallmentCount: 1,
            Amount: order.payment //TODO: calculate total amount of lines
        }]
    })
}