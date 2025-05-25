import CoreClass from "../core/CoreClass.js";
import ProductDetail from "../models/ProductDetail.js";
import ProductInventory from "../models/ProductInventory.js";

export default class NebimObjectHelper extends CoreClass {
    constructor() {
        super();
    }

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
}