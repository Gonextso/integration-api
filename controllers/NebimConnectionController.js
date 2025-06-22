import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import NebimV3IntegratorAPI from "../apis/NebimV3IntegratorAPI.js";

export default new class NebimConnectionController extends CoreController {
    constructor() {
        super();
    }
    
    check = async (req, res) => {
        const nebimAPI = new NebimV3IntegratorAPI(req.tenant); 

        const exception = await nebimAPI.checkConnection(req.body);

        if (exception) {
            return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: exception });
        }
        
        return this.response(res, { status: HttpStatusCodes.SUCCESS, info: "Connection to Nebim V3 Integrator is successfully created" });
    }
}