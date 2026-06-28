import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import NebimV3IntegratorAPI from "../apis/NebimV3IntegratorAPI.js";
import {
    buildErrorResponse,
    buildNetworkErrorPayload,
    friendlyNebimError,
} from "../helpers/NebimErrorHelper.js";

export default new class InputValidationController extends CoreController {
    constructor() {
        super();
    }

    run = async (req, res) => {
        const nebimAPI = new NebimV3IntegratorAPI(req.tenant);
        const procName = req.tenant?.nebim?.procNames?.inputValidation || "sp_GO_InputValidator";

        try {
            const rows = await nebimAPI.runProc(procName, { LangCode: "TR" });

            if (rows instanceof Error) {
                const payload = buildNetworkErrorPayload(rows, req.tenant?.nebim?.host);
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

            if (!Array.isArray(rows) || rows.length === 0) {
                return this.response(res, {
                    status: HttpStatusCodes.BAD_REQUEST,
                    info: "Sorgular düzgün çalışmamış",
                    content: {
                        error: {
                            code: "EMPTY_VALIDATION",
                            detail: "Input validation procedure returned no rows",
                        },
                    },
                });
            }

            return this.response(res, {
                status: HttpStatusCodes.SUCCESS,
                info: "Input validation completed",
                content: { rows },
            });
        } catch (error) {
            const payload = buildNetworkErrorPayload(error, req.tenant?.nebim?.host);
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
