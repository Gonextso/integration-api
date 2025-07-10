import namespace from "../helpers/CLSHelper.js";
import StringHelper from "../helpers/StringHelper.js";

export default new class RequestMiddleware {
    setTraceId = async (req, res, next) => {
        namespace.run(_ => {
            const traceId = StringHelper.generateUUID().replace(/-/g, "");

            namespace.set('traceId', traceId);
            req.traceId = traceId;
            res.setHeader('X-Trace-Id', traceId);

            next();
        })
    }
}