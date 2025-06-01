import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import { DateTime } from "luxon";

export default new class ValidatorMiddleware extends CoreController {
    constructor() {
        super();
    }

    validateDatesFromQuery = async (req, res, next) => {
        const { startDate, endDate } = req.query;

        const parseDate = (value, paramName) => {
            if (!value) return null;

            if (/^\d{11,}$/.test(value)) {
                const epoch = DateTime.fromMillis(Number(value));
                if (epoch.isValid) return epoch.toJSDate();
            }

            let dt = DateTime.fromISO(value, { setZone: true });
            if (dt.isValid) return dt.toJSDate();

            dt = DateTime.fromFormat(value, "yyyy-MM-dd");
            if (dt.isValid) return dt.toJSDate();

            throw new Error(`Invalid ${paramName}. Use ISO 8601 (e.g. 2025-05-23 or 2025-05-23T10:00:00Z) or epoch milliseconds.`);
        };

        try {
            if (!startDate) {
                return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: "'startDate' not provided" });
            }

            const parsedStart = parseDate(startDate, "startDate");
            const parsedEnd = endDate ? parseDate(endDate, "endDate") : new Date();

            if (parsedStart > parsedEnd) {
                return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: "'startDate' cannot be after 'endDate'." });
            }

            req.startDate = parsedStart.toISOString();
            req.endDate = parsedEnd.toISOString();

            return next();
        } catch (err) {
            return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: err.message });
        }
    }

    isRequestBodyExists = async (req, res, next) => {
        if (!req.body) return this.response(res, { status: HttpStatusCodes.BAD_REQUEST, info: "Request body is missing" });
        return next();
    }
}