import CoreController from "../core/CoreControler.js";
import Company from "../models/db/Company.js"
import mongoose from "mongoose";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";

export default new class ConfigMiddleware extends CoreController {
    constructor() {
        super();
    }

    setConfigViaCompanyId = async (req, res, next) => {
        const companyId = req.headers["x-company-id"] || req.get("x-company-id");

        if (!companyId) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info: "'x-company-id' header is required.",
            });
        }

        if (!mongoose.isValidObjectId(companyId)) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                info: "Invalid company id format.",
            });
        }

        const company = await Company.findById(companyId).lean();

        if (!company) {
            return this.response(res, {
                status: HttpStatusCodes.NOT_FOUND,
                info: "Company not found.",
            });
        }

        req.company = company;

        return next();
    }
}