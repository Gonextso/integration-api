import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js";
import CoreClass from "../../core/CoreClass.js";
import NebimObjectHelper from "../../helpers/NebimObjectHelper.js";

export default class NebimProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
    }

    /**
     * Parameters for sp_GO_GetProductDetails (and market content fan-out).
     * `startDate` is passed through as `@Date`; the proc filters rows with LastUpdatedDate >= @Date.
     */
    _buildProductDetailsProcQuery = startDate => {
        const product = this.tenant.nebim.product ?? {};
        const barcodeTypeCode = product.barcodeTypeCode ?? 'EAN13';
        const isColorBased = Boolean(product.isColorBased);

        return {
            Date: startDate,
            BarcodeTypeCode: barcodeTypeCode,
            IsColorBased: isColorBased ? 1 : 0,
            UseInternetOnVariant: product.useInternetOnVariant ? 1 : 0,
            UsedSeparatorOnColorAndItem: isColorBased
                ? (product.usedSeparatorOnColorAndItem?.trim() || '-')
                : '-',
            UsedSeparatorOnColorAndItemDescriptions: isColorBased
                ? (product.usedSeparatorOnColorAndItemDescriptions?.length === 1
                    ? product.usedSeparatorOnColorAndItemDescriptions
                    : ' ')
                : ' ',
        };
    }

    /** @deprecated Use _buildProductDetailsProcQuery */
    _buildProductProcQuery = startDate => this._buildProductDetailsProcQuery(startDate);

    /**
     * Parameters for sp_GO_GetProductPrice.
     * `startDate` is passed through as `@Date`; filtering happens inside the stored procedure.
     */
    _buildPriceProcQuery = startDate => {
        const product = this.tenant.nebim.product ?? {};
        const query = {
            Date: startDate,
            BarcodeTypeCode: product.barcodeTypeCode ?? 'EAN13',
        };
        if (product.priceSellCode?.trim()) {
            query.SalePriceGroupCode = product.priceSellCode.trim();
        }
        if (product.priceCompareCode?.trim()) {
            query.PriceGroupCode = product.priceCompareCode.trim();
        }
        return query;
    }

    /**
     * Parameters for sp_GO_GetProductInventory.
     * `startDate` is passed through as `@Date`; filtering happens inside the stored procedure.
     */
    _buildInventoryProcQuery = startDate => {
        const product = this.tenant.nebim.product ?? {};
        const orderStoreCode = this.tenant.nebim.order?.store ?? null;
        const responsibilityAreaCode = product.responsibilityAreaCode?.trim() || 'WEB';

        return {
            Date: startDate,
            BarcodeTypeCode: product.barcodeTypeCode ?? 'EAN13',
            OrderStoreCode: orderStoreCode,
            ResponsibiltyAreaCode: responsibilityAreaCode,
        };
    }

    getProductDetailList = async startDate => {
        const detailsQuery = this._buildProductDetailsProcQuery(startDate);
        const priceQuery = this._buildPriceProcQuery(startDate);

        const details = await this.api.runProc(this.tenant.nebim.procNames.product.details, detailsQuery);
        const prices = await this.api.runProc(this.tenant.nebim.procNames.product.price, priceQuery); 
 
        return NebimObjectHelper.getDetailList(details, prices, this.tenant);
    }

    fetchInventories = async startDate => {
        const query = this._buildInventoryProcQuery(startDate);

        const inventory = await this.api.runProc(this.tenant.nebim.procNames.product.inventory, query);

        return NebimObjectHelper.getInventories(inventory);
    }

    #withItemCode = (query, itemCode) => {
        const trimmed = itemCode?.trim();
        if (!trimmed) return query;
        return { ...query, ItemCode: trimmed };
    }

    getProductDetailListByItemCode = async itemCode => {
        const trimmed = itemCode?.trim();
        if (!trimmed) {
            throw new Error("ItemCode is required");
        }

        const startDate = new Date().toISOString();
        const detailsQuery = this.#withItemCode(this._buildProductDetailsProcQuery(startDate), trimmed);
        const priceQuery = this.#withItemCode(this._buildPriceProcQuery(startDate), trimmed);

        const details = await this.api.runProc(this.tenant.nebim.procNames.product.details, detailsQuery);
        const prices = await this.api.runProc(this.tenant.nebim.procNames.product.price, priceQuery);

        return NebimObjectHelper.getDetailList(details, prices, this.tenant);
    }

    fetchInventoriesByItemCode = async itemCode => {
        const trimmed = itemCode?.trim();
        if (!trimmed) {
            throw new Error("ItemCode is required");
        }

        const startDate = new Date().toISOString();
        const query = this.#withItemCode(this._buildInventoryProcQuery(startDate), trimmed);
        const inventory = await this.api.runProc(this.tenant.nebim.procNames.product.inventory, query);

        return NebimObjectHelper.getInventories(inventory);
    }

    _buildFindInStoreProcQuery = barcodes => {
        const barcodeTypeCode = this.tenant.nebim.product?.barcodeTypeCode ?? 'EAN13';
        return {
            BarcodeTypeCode: barcodeTypeCode,
            Barcodes: barcodes.join(','),
        };
    }

    fetchFindInStoreByBarcodes = async barcodes => {
        if (!Array.isArray(barcodes) || barcodes.length === 0) {
            return [];
        }

        const query = this._buildFindInStoreProcQuery(barcodes);
        const rows = await this.api.runProc(
            this.tenant.nebim.procNames.product.findInStore,
            query
        );

        return NebimObjectHelper.getFindInStoreByBarcode(rows);
    }

    fetchStoreInfo = async () => {
        const rows = await this.api.runProc(
            this.tenant.nebim.procNames.product.storeInfo,
            {}
        );

        return NebimObjectHelper.getStoreInfoList(rows);
    }

    /**
     * Per-currency price fan-out. Calls the price proc once per CurrencyCode in parallel.
     * Returns the settled results; each fulfilled value is
     * { currencyCode, prices: Map<barcode, {sale_price, compare_at_price, currency}> }.
     */
    fetchPricesByCurrency = async (startDate, currencyCodes) => {
        const codes = [...new Set((currencyCodes ?? []).filter(Boolean))];

        return Promise.allSettled(
            codes.map(async currencyCode => {
                const query = {
                    ...this._buildPriceProcQuery(startDate),
                    CurrencyCode: currencyCode,
                };
                const rows = await this.api.runProc(this.tenant.nebim.procNames.product.price, query);
                return {
                    currencyCode,
                    prices: NebimObjectHelper.getPriceMapByBarcode(rows, currencyCode),
                };
            })
        );
    }

    /**
     * Per-language content fan-out. Calls the details proc once per LangCode in parallel.
     * Returns the settled results; each fulfilled value is
     * { langCode, products: ProductDetail[] } where title/description are language specific.
     */
    fetchDetailsByLang = async (startDate, langCodes) => {
        const codes = [...new Set((langCodes ?? []).filter(Boolean))];

        return Promise.allSettled(
            codes.map(async langCode => {
                const query = {
                    ...this._buildProductDetailsProcQuery(startDate),
                    LangCode: langCode,
                };
                const rows = await this.api.runProc(this.tenant.nebim.procNames.product.details, query);
                return {
                    langCode,
                    products: NebimObjectHelper.getDetailList(rows, [], this.tenant),
                };
            })
        );
    }
}