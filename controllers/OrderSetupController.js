import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import OrderSetupBusiness from "../business/OrderSetupBusiness.js";
import {
    buildErrorResponse,
    buildNetworkErrorPayload,
    friendlyNebimError,
} from "../helpers/NebimErrorHelper.js";

function mapSetupError(error) {
    const message = error?.message || String(error);

    if (/sipariş bulunamadı/i.test(message)) {
        return {
            code: "ORDER_NOT_FOUND",
            detail: message,
        };
    }

    if (/orderid is required/i.test(message)) {
        return {
            code: "ORDER_ID_REQUIRED",
            detail: message,
        };
    }

    if (/daha önce nebim'e aktarılmış/i.test(message)) {
        return {
            code: "ORDER_ALREADY_SYNCED",
            detail: message,
        };
    }

    return {
        code: "ORDER_SETUP_FAILED",
        detail: message,
    };
}

export default new class OrderSetupController extends CoreController {
    constructor() {
        super();
    }

    run = async (req, res) => {
        const orderId = req.body?.orderId;
        const setupBusiness = new OrderSetupBusiness(req.tenant);

        try {
            const result = await setupBusiness.runSetupTest(orderId);

            return this.response(res, {
                status: HttpStatusCodes.SUCCESS,
                info: "Setup test order synced",
                content: {
                    erpOrderNumber: result.erpOrderNumber,
                    shopifyOrderId: result.shopifyOrderId,
                    orderName: result.orderName,
                    orderAdminUrl: result.orderAdminUrl,
                },
            });
        } catch (error) {
            const networkPayload = buildNetworkErrorPayload(error, req.tenant?.nebim?.host);
            const payload = networkPayload?.code && networkPayload.code !== "UNKNOWN"
                ? networkPayload
                : mapSetupError(error);
            const { info, content } = buildErrorResponse(
                friendlyNebimError(payload?.code, payload?.detail),
                payload,
            );

            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info,
                content,
            });
        }
    };
};
