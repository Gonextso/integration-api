import ShopifyOrderBusiness from "../business/ShopifyOrderBusiness.js";
import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";

export default new class ShopifyNebimOrderController extends CoreController {
    constructor() {
        super();
        this.shopifyOrderBusiness = new ShopifyOrderBusiness()
    }
    
    sync = async (req, res) => {
        //TODO: make is async not wait process
        const shopifyOrders = await this.shopifyOrderBusiness.getOrders(req.startDate, req.endDate)

        return this.response(res, { status: HttpStatusCodes.ACCEPTED, info: "Needs to change", content: shopifyOrders });
    }
}