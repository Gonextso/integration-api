import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js";
import CoreClass from "../../core/CoreClass.js";
import NebimObjectHelper from "../../helpers/NebimObjectHelper.js";

export default class NebimProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
    }

    _buildProductProcQuery = startDate => {
        const barcodeTypeCode = this.tenant.nebim.product?.barcodeTypeCode ?? 'EAN13';
        return { Date: startDate, BarcodeTypeCode: barcodeTypeCode };
    }

    getProductDetailList = async startDate => {
        const query = this._buildProductProcQuery(startDate);

        const details = await this.api.runProc(this.tenant.nebim.procNames.product.details, query);
        const prices = await this.api.runProc(this.tenant.nebim.procNames.product.price, query); 
 
        return NebimObjectHelper.getDetailList(details, prices, this.tenant);
    }

    fetchInventories = async startDate => {
        const query = this._buildProductProcQuery(startDate);

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
}