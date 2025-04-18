import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";

export default new class HealthController extends CoreController {
    constructor() {
        super();
    }
    
    health = async (_, res) => {
        return this.response(res, { status: HttpStatusCodes.SUCCESS });
    }
}