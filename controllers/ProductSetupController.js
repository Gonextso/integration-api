import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import ProductSetupBusiness from "../business/ProductSetupBusiness.js";
import {
    buildErrorResponse,
    buildNetworkErrorPayload,
    friendlyNebimError,
} from "../helpers/NebimErrorHelper.js";

function mapSetupError(error) {
    const message = error?.message || String(error);

    if (/ürün bulunamadı/i.test(message)) {
        return {
            code: "PRODUCT_NOT_FOUND",
            detail: message,
        };
    }

    if (/shopify'a aktarılamadı|ürün linki oluşturulamadı/i.test(message)) {
        return {
            code: "PRODUCT_SHOPIFY_SYNC_FAILED",
            detail: message,
        };
    }

    if (/itemcode is required/i.test(message)) {
        return {
            code: "PRODUCT_ITEM_CODE_REQUIRED",
            detail: message,
        };
    }

    return {
        code: "PRODUCT_SETUP_FAILED",
        detail: message,
    };
}

export default new class ProductSetupController extends CoreController {
    constructor() {
        super();
    }

    run = async (req, res) => {
        const itemCode = req.body?.itemCode;
        const setupBusiness = new ProductSetupBusiness(req.tenant);

        try {
            const result = await setupBusiness.runSetupTest(itemCode);

            return this.response(res, {
                status: HttpStatusCodes.SUCCESS,
                info: "Setup test product synced",
                content: {
                    itemCode: result.itemCode,
                    productUrl: result.productUrl,
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
