import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import NebimCustomerBusiness from "../business/nebim/CustomerBusiness.js";
import {
    buildErrorResponse,
    buildNetworkErrorPayload,
    friendlyNebimError,
} from "../helpers/NebimErrorHelper.js";

function mapSetupError(error) {
    const message = error?.message || String(error);

    if (/address codes cache is empty/i.test(message)) {
        return {
            code: "EMPTY_ADDRESS_CACHE",
            detail: message,
        };
    }

    if (/address codes procedure failed/i.test(message)) {
        return {
            code: "ADDRESS_CODES_PROC_FAILED",
            detail: message,
        };
    }

    if (/address cannot found from cache/i.test(message)) {
        return {
            code: "EMPTY_ADDRESS_CACHE",
            detail: message,
        };
    }

    return {
        code: "CUSTOMER_SETUP_FAILED",
        detail: message,
    };
}

export default new class CustomerSetupController extends CoreController {
    constructor() {
        super();
    }

    run = async (req, res) => {
        const customerBusiness = new NebimCustomerBusiness(req.tenant);

        try {
            const result = await customerBusiness.createSetupTestCustomer();

            return this.response(res, {
                status: HttpStatusCodes.SUCCESS,
                info: "Setup test customer created",
                content: {
                    customerCode: result.CustomerCode,
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
