import axios from "axios";
import CoreClass from "../core/CoreClass.js";
import StringHelper from "./StringHelper.js";
import RequestLog from "../models/db/RequestLog.js";
import CLSHelper from "./CLSHelper.js";

export default class WebRequestHelper extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.tenant = tenant;
    }

    get = async (...args) => {
        const id = StringHelper.generateUUID();

        this.logger.info4(`request_id:${id} - Request send to external system; HTTP/GET; ${args.map(x => typeof x === 'object' ? JSON.stringify(x.headers ? this.#removeSecrets(x.headers) : x) : x.toString()).join('; ')}`);

        return this.#trackRequest(() => axios.get(...args).then(response => {
            this.logger.info3(`request_id:${id} - Response from external system; status ${response.status}; ${JSON.stringify(response.data)}`);

            return response;
        }), id, ...args);
    }

    post = async (...args) => {
        const id = StringHelper.generateUUID();

        this.logger.info4(`request_id:${id} - Request send to external system; HTTP/POST; ${args.map(x => typeof x === 'object' ? JSON.stringify(x.headers ? this.#removeSecrets(x.headers) : x) : x.toString()).join('; ')}`);

        return this.#trackRequest(() => axios.post(...args).then(response => {
            this.logger.info3(`request_id:${id} - Response from external system; status ${response.status}; ${JSON.stringify(response.data)}`);

            return response;
        }), id, ...args);
    }

    gpost = async (...args) => {
        const id = StringHelper.generateUUID();

        this.logger.info4(`request_id:${id} - Request send to external system; HTTP/POST; ${args.map(x => typeof x === 'object' ? JSON.stringify(x.headers ? this.#removeSecrets(x.headers) : x).replace(/\\n/g, '').replace(/ /g, '') : x.toString()).join(' ; ')}`);

        return this.#trackRequest(() => axios.post(...args).then(response => {
            this.logger.info3(`request_id:${id} - Response recieved from external system; status ${response.status}; ${JSON.stringify(response.data)}`);

            return response;
        }), id, ...args);
    }

    #removeSecrets = (object) => {
        const headers = JSON.parse(JSON.stringify(object));
        Object.keys(headers).map(x => x.toLowerCase().includes('token') ? headers[x] = "masked_by_gonextso" : null)

        return headers;
    }

    #getEndTime = (start) => {
        const [seconds, nanoseconds] = process.hrtime(start);
        return seconds * 1e3 + nanoseconds / 1e6;; 
    }

    #extractMethodType = (method) => {
        if(method.toLowerCase().includes('axios.get')) return 'GET';
        if(method.toLowerCase().includes('axios.post')) return 'POST';
        if(method.toLowerCase().includes('axios.put')) return 'PUT';
        if(method.toLowerCase().includes('axios.delete')) return 'DELETE';
        if(method.toLowerCase().includes('axios.patch')) return 'PATCH';

        return 'NO_METHOD_FOUND';
    }

    #trackRequest = (method, id, ...args) => {
        const start = process.hrtime();

        const log = RequestLog({
            tenant: this.tenant._id,
            requestId: id,
            traceId: CLSHelper.get('traceId'),
            method: this.#extractMethodType(method.toString()),
            status: 0,
            responseTime: 0,
            response: null,
            url: args[0],
            headers: JSON.stringify(this.#removeSecrets(args[2].headers)),
            body: JSON.stringify(args[1])
        })

        return method()
            .then(result => {
                this.logger.info3(`request_id:${id} - Processed in ${this.#getEndTime(start).toFixed(2)} ms`);
                const responseString = JSON.stringify(result.data);
            
                log.status = result.status;
                log.responseTime = this.#getEndTime(start).toFixed(2);
                log.response = Buffer.byteLength(responseString, 'utf8') > 3 * 1024 * 1024 //TODO: implement plus subscibers can hold up to 16mb log
                    ? "data is larger than 3mb truncated"
                    : responseString;

                return result;
            })
            .catch(error => {

                log.status = result.status;
                log.responseTime = this.#getEndTime(start).toFixed(2);
                log.response = JSON.stringify(result.data);

                throw error;
            })
            .finally(_ => {
                log.save() //TODO: can be closed via interaction for success logs. nebim returns 200 anytime
            })
    }
}
