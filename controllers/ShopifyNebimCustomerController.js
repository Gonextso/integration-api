import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";

export default new class ShopifyNebimCustomerController extends CoreController {
    constructor() {
        super();
    }

    //TODO: onhold
    updateConsent = async (req, res) => {
        const { communitaionType } = req.params;
        return this.response(res, { status: HttpStatusCodes.SUCCESS, content: req.params })
    }
}