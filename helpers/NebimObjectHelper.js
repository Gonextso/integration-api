import CoreClass from "../core/CoreClass.js";
import SystemCodes from "../enums/SystemCodes.js";
import ProductDetail from "../models/ProductDetail.js";
import ProductInventory from "../models/ProductInventory.js";

export default class NebimObjectHelper extends CoreClass {
    static #mapVariantPrices = (price, sellPrice) => {
        const basePrice = Number(price);
        const salePrice = Number(sellPrice);
        return {
            base_price: basePrice,
            sale_price: salePrice,
            compare_at_price: basePrice > salePrice ? basePrice : null,
        };
    };

    static getDetailList = (detailList, priceList, tenant) => {
        const products = new Map();
        const prices = {};

        for (const row of priceList) {
            prices[row.Barcode] = {
                barcode: row.Barcode,
                ...NebimObjectHelper.#mapVariantPrices(row.Price, row.SellPrice),
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
                    description: row.Notes ?? "",
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

    // Builds a Map<barcode, { barcode, sale_price, compare_at_price, base_price, currency }>
    // from a Nebim price proc result. Used by the per-currency market price fan-out.
    static getPriceMapByBarcode = (priceList, fallbackCurrency = null) => {
        const map = new Map();
        for (const row of priceList ?? []) {
            if (!row?.Barcode) continue;
            map.set(row.Barcode, {
                barcode: row.Barcode,
                ...NebimObjectHelper.#mapVariantPrices(row.Price, row.SellPrice),
                currency: row.CurrencyCode ?? fallbackCurrency,
            });
        }
        return map;
    };

    static getInventories = inventoryList => inventoryList.map(x => new ProductInventory({
        barcode: x.Barcode,
        quantity: x.Inventory > 0 ? x.Inventory : 0
    }));

    /**
     * Parses a PostGIS-style POINT string: "POINT (lng lat)" → { lat, lng }
     * Returns null if the string is missing or doesn't match the expected format.
     */
    static #parseGeoPoint = geoStr => {
        if (!geoStr) return null;
        const match = String(geoStr).match(/^POINT\s*\(\s*([\d.+-]+)\s+([\d.+-]+)\s*\)$/i);
        if (!match) return null;
        const lng = parseFloat(match[1]);
        const lat = parseFloat(match[2]);
        if (isNaN(lng) || isNaN(lat)) return null;
        return { lat, lng };
    };

    /**
     * Normalizes raw Nebim store rows into one object per store.
     * Rows that share the same Desc are merged: static fields (address, phone, etc.)
     * are taken from the first occurrence; per-day schedule rows are collected
     * into store_work_info[].
     */
    static getStoreInfoList = rows => {
        const storeMap = new Map();

        for (const row of (rows ?? [])) {
            const desc = row?.Desc;
            if (!desc) continue;

            if (!storeMap.has(desc)) {
                const geo = NebimObjectHelper.#parseGeoPoint(row.GeoLocation);
                const address = row.Address ?? '';
                const link_html = (geo && address)
                    ? `<a href="https://www.google.com/maps?q=${geo.lat},${geo.lng}">${address}</a>`
                    : '';

                storeMap.set(desc, {
                    desc,
                    geo_location: row.GeoLocation ?? '',
                    link_html,
                    address,
                    phone: row.Phone ?? '',
                    email: row.Email ?? '',
                    store_work_info: [],
                });
            }

            storeMap.get(desc).store_work_info.push({
                day: row.DaysOfWeek ?? 0,
                opening_hours: row.OpeningHours ?? '',
                closing_hours: row.ClosingHours ?? '',
            });
        }

        return [...storeMap.values()];
    };

    static getFindInStoreByBarcode = rows => {
        const grouped = new Map();

        for (const row of rows ?? []) {
            const barcode = row.Barcode;
            if (!barcode) continue;

            if (!grouped.has(barcode)) {
                grouped.set(barcode, []);
            }

            grouped.get(barcode).push({
                desc: row.StoreDesc ?? '',
                inventory_count: row.Inventory > 0 ? Number(row.Inventory) : 0,
            });
        }

        return [...grouped.entries()].map(([barcode, stores]) => ({ barcode, stores }));
    }

    static toNebimOrder = (tenant, order, customer) => {
        // Micro export applies only when the tenant enabled it AND the order ships to a
        // country different from the shop's home country (a foreign market order).
        const isMicroExport = Boolean(tenant.nebim?.order?.isMicroExport);
        const isForeign = Boolean(
            order.address?.country
            && tenant.shopify?.countryCode
            && order.address.country !== tenant.shopify.countryCode
        );
        const useMicroExport = isMicroExport && isForeign;

        // Micro export bills in the market (presentment) currency; domestic stays on shop currency.
        const currencyCode = useMicroExport
            ? (order.market_currency ?? tenant.shopify?.currencyCode ?? order.currency ?? "TRY")
            : (tenant.shopify?.currencyCode ?? order.currency ?? "TRY");

        const incotermCode1 = (tenant.nebim?.order?.incotermCode1 ?? "").toString().trim();
        const incotermCode2 = (tenant.nebim?.order?.incotermCode2 ?? "").toString().trim();

        const shippingPayment = Number(
            useMicroExport ? (order.shipping_payment_presentment ?? 0) : (order.shipping_payment ?? 0)
        );
        const cargoItemCode = (tenant.nebim?.cargoItemCode ?? tenant.nebim?.order?.cargoItemCode ?? "").toString().trim();
        const isCargoService = Boolean(tenant.nebim?.isCargoService ?? tenant.nebim?.order?.isCargoService);
        const lines = order.lines.map(x => ({
            UsedBarcode: x.barcode,
            PriceVI: useMicroExport ? x.price_presentment : x.price,
            Qty1: x.quantity,
            LineDescription: x.line_id,
            LDiscountVI4: useMicroExport ? x.line_discount_presentment : x.line_discount,
            ...(useMicroExport ? { CurrencyCode: currencyCode } : {})
        }));

        // Order-level ("dip") discounts aren't tied to a line item, so Shopify only reports
        // them via order.totalDiscounts, not per-line. Nebim has no equivalent order-level
        // discount amount field, so we express it as a rate against the merchandise subtotal
        // (shipping excluded) and let Nebim apply it across the product lines.
        const merchandiseSubtotal = order.lines.reduce(
            (sum, x) => sum + (useMicroExport ? x.price_presentment : x.price) * x.quantity,
            0
        );
        const lastDiscount = useMicroExport ? order.last_discount_presentment : order.last_discount;
        const discountRate = lastDiscount > 0 && merchandiseSubtotal > 0
            ? (lastDiscount / merchandiseSubtotal) * 100
            : 0;

        if (shippingPayment > 0) {
            if (!cargoItemCode) {
                throw new Error(`Cargo item code is required when shipping payment exists for order ${order.order_id}`);
            }

            lines.push({
                ItemTypeCode: isCargoService ? "5" : "1",
                ItemCode: cargoItemCode,
                Qty1: 1,
                PriceVI: shippingPayment,
                ...(useMicroExport ? { CurrencyCode: currencyCode } : {})
            });
        }

        return {
            ModelType: useMicroExport ? 228 : 6,
            ...customer,
            ...(useMicroExport && incotermCode1 ? { IncotermCode1: incotermCode1 } : {}),
            ...(useMicroExport && incotermCode2 ? { IncotermCode2: incotermCode2 } : {}),
            PosTerminalID: tenant.nebim.order.posTerminalId,
            OfficeCode: tenant.nebim.order.office,
            StoreCode: tenant.nebim.order.store,
            CompanyCode: tenant.nebim.order.company,
            StoreWarehouseCode: tenant.nebim.order.warehouse,
            OrderDate: order.order_date,
            DocumentNumber: order.order_id,
            Description: `shopify_info:${order.order_id}${order.tags ? '; tags: ' : ''}${order.tags.join(', ')}`,
            DeliveryCompanyCode: tenant.nebim.order.deliveryCompanyCode ?? tenant.nebim.order.deliveryCompany,
            ShipmentMethodCode: 2,
            IsCompleted: true,
            IsSalesViaInternet: true,
            ...(discountRate > 0 ? { TDisRate4: discountRate } : {}),
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
                CurrencyCode: currencyCode,
                InstallmentCount: 1,
                Amount: useMicroExport ? order.payment_presentment : order.payment
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