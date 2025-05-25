import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import Company from "../models/db/Company.js";

export default new class DevelopmentController extends CoreController {
    constructor() {
        super();
    }
    
    getAllCompanies = async (_, res) => {
        return this.response(res, { status: HttpStatusCodes.SUCCESS, content: await Company.find() });
    }
}