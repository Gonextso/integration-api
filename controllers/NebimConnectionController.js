import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import NebimV3IntegratorAPI from "../apis/NebimV3IntegratorAPI.js";
import {
    buildErrorResponse,
    buildNetworkErrorPayload,
    friendlyNebimError,
} from "../helpers/NebimErrorHelper.js";

export default new class NebimConnectionController extends CoreController {
    constructor() {
        super();
    }
    
    check = async (req, res) => {
        const nebimAPI = new NebimV3IntegratorAPI(req.tenant); 

        if (!req.body) {
            return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: "Request body is required" });
        }

        const connectionResult = await nebimAPI.checkConnection(req.body);

        if (connectionResult?.error) {
            const { info, content } = buildErrorResponse(
                friendlyNebimError(connectionResult.code, connectionResult.message),
                {
                    code: connectionResult.code || "NEBIM_CONNECTION",
                    detail: connectionResult.detail || connectionResult.message,
                },
            );
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info,
                content,
            });
        }

        const userInfo = await nebimAPI.getUserInfo(req.body.host);

        if (userInfo instanceof Error) {
            const payload = buildNetworkErrorPayload(userInfo, req.body.host);
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

        return this.response(res, {
            status: HttpStatusCodes.SUCCESS,
            info: "Connection to Nebim V3 Integrator is successfully created",
            content: {
                ...userInfo,
                Token: connectionResult.token,
            },
        });
    }
}