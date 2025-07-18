import OrderBusiness from "../business/OrderBusiness.js";
import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import SystemCodes from "../enums/SystemCodes.js";

export default new class ShopifyNebimOrderController extends CoreController {
    constructor() {
        super();
    }

    sync = async (req, res) => {
        const orderBusiness = new OrderBusiness(req.tenant);

        orderBusiness.syncShopifyToNebim(req.startDate, req.endDate);

        return this.response(res, { status: HttpStatusCodes.ACCEPTED });
    }

    //TODO: consider this method location
    getSyncFailedOrders = async (req, res) => {
        const orderBusiness = new OrderBusiness(req.tenant);

        return this.response(res, {
            status: HttpStatusCodes.SUCCESS,
            content: await orderBusiness.getSyncFailedOrders(
                SystemCodes.ERP.V3_INTEGRATOR,
                SystemCodes.ECOMMERCE.SHOPIFY
            )
        });
    }

    syncFailedOrders = async (req, res) => {
        const orderBusiness = new OrderBusiness(req.tenant);

        if (!req.body.orderNumberList) return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: "orderNumberList is required" });

        const orderNumberList = req.body.orderNumberList;

        orderBusiness.syncFailedOrders(
            SystemCodes.ERP.V3_INTEGRATOR,
            SystemCodes.ECOMMERCE.SHOPIFY,
            orderNumberList
        )

        return this.response(res, { status: HttpStatusCodes.ACCEPTED });
    }

    syncOrderStatus = async (req, res) => {
        const orderBusiness = new OrderBusiness(req.tenant);

        orderBusiness.syncOrderStatus(req.startDate, req.endDate);

        return this.response(res, { status: HttpStatusCodes.ACCEPTED });
    }
}