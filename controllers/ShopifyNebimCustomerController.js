import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import NebimCustomerBusiness from "../business/nebim/CustomerBusiness.js";
import CustomerConsentSyncBusiness from "../business/CustomerConsentSyncBusiness.js";

export default new class ShopifyNebimCustomerController extends CoreController {
    constructor() {
        super();
    }

    updateConsent = async (req, res) => {
        const { communitaionType } = req.params;

        if (!["email", "gsm"].includes(communitaionType)) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info: "communitaionType must be email or gsm"
            });
        }

        const customer = req.body?.customer ?? req.body;

        if (!customer?.email && !customer?.phone) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info: "email or phone is required"
            });
        }

        const customerBusiness = new NebimCustomerBusiness(req.tenant);
        const result = await customerBusiness.updateConsent(customer, communitaionType, {
            sourceEventId: req.body?.audit?.sourceEventId || req.get?.("x-source-event-id") || null,
            sourcePayloadRaw: req.body?.audit?.sourcePayload || customer,
        });

        if (!result) {
            return this.response(res, {
                status: HttpStatusCodes.NOT_FOUND,
                info: "Customer not found in Nebim"
            });
        }

        if (result.skipped) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info: result.reason,
                content: result
            });
        }

        return this.response(res, {
            status: HttpStatusCodes.SUCCESS,
            content: result
        });
    }

    syncConsents = async (req, res) => {
        const business = new CustomerConsentSyncBusiness(req.tenant);
        const summary = await business.sync(req.startDate);

        return this.response(res, {
            status: HttpStatusCodes.SUCCESS,
            content: summary,
        });
    }
}
