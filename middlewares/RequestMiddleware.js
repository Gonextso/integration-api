import cyrpto from "crypto";
import namespace from "../helpers/CLSHelper.js";

const generateUUID = () => {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (c ^ cyrpto.randomBytes(1)[0] & 15 >> c / 4).toString(16));
}

export default new class LogMiddleware {
    setTraceId = async (req, res, next) => {
        namespace.run(_ => {
            const traceId = generateUUID();

            namespace.set('traceId', traceId);
            req.traceId = traceId;
            res.setHeader('X-Trace-Id', traceId);

            next();
        })
    }
}