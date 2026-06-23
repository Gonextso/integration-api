import ProductBusiness from "../business/ProductBusiness.js";
import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";

export default new class ShopifyNebimProductController extends CoreController {
    constructor() {
        super();
    }
    
    syncDetails = async (req, res) => {
        const productBusiness = new ProductBusiness(req.tenant);

        productBusiness.syncDetailsNebimToShopify(req.startDate, req.endDate);

        return this.response(res, { status: HttpStatusCodes.ACCEPTED });
    }

    syncInventory = async (req, res) => {
        const productBusiness = new ProductBusiness(req.tenant);

        productBusiness.syncInventoryNebimToShopify(req.startDate, req.endDate);

        return this.response(res, { status: HttpStatusCodes.ACCEPTED });
    }

    syncFindInStore = async (req, res) => {
        const productBusiness = new ProductBusiness(req.tenant);

        productBusiness.syncFindInStoreNebimToShopify(req.startDate, req.endDate);

        return this.response(res, { status: HttpStatusCodes.ACCEPTED });
    }
}