import CoreAPI from "../core/CoreAPI.js";
import NebimCache from "../cache/NebimCache.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import CryptoHelper from "../helpers/CryptoHelper.js";
import {
    buildNetworkErrorPayload,
    friendlyNebimError,
} from "../helpers/NebimErrorHelper.js";

const normalizeRunProcParameters = parameters => Object.fromEntries(
    Object.entries(parameters ?? {}).map(([key, value]) => [key, value === null ? "" : value])
);

export default class NebimV3IntegratorAPI extends CoreAPI {
    constructor(tenant) {
        super(tenant);
        this.cache = new NebimCache(tenant);
    }

    checkConnection = async (infos) => {
        const  { host, userGroup, user, password } = infos;

        if (!host || !userGroup || !user || !password) {
            return {
                error: true,
                message: "Host, UserGroup, User and Password are required to connect to Nebim V3 Integrator",
                code: "VALIDATION",
                detail: "Host, UserGroup, User and Password are required to connect to Nebim V3 Integrator",
            };
        }

        const response = await this.httpRequest.post(`${host}/IntegratorService/Connect`, {
            UserGroupCode: userGroup,
            UserName: user,
            Password: password,
            Validate: true
        });

        if (response instanceof Error) {
            const payload = buildNetworkErrorPayload(response, host);
            return {
                error: true,
                message: friendlyNebimError(payload?.code, payload?.detail),
                code: payload?.code || response.code || "NETWORK",
                detail: payload?.detail || response.message,
            };
        }

        if (response.data["Exception"]) {
            return {
                error: true,
                message: response.data["Exception"],
                code: "NEBIM_EXCEPTION",
                detail: response.data["Exception"],
            };
        }

        let accessToken = response.data["Token"];
        let sessionId = response.data["SessionID"];
        const now = new Date();

        if (!accessToken) {
            if (sessionId) {
                return {
                    error: true,
                    message: `Nebim V3 Entegratör IIS ayarlarında "Oturum Durumu -> Etkinleştirilmedi" olmalıdır.`,
                    code: "NEBIM_SESSION",
                    detail: `Nebim V3 Entegratör IIS ayarlarında "Oturum Durumu -> Etkinleştirilmedi" olmalıdır.`,
                };
            }
            return {
                error: true,
                message: "Something went wrong while connecting Nebim V3 Integrator",
                code: "NEBIM_TOKEN",
                detail: "Something went wrong while connecting Nebim V3 Integrator",
            };
        }

        await this.cache.set("Token", { token: accessToken, expiryDate: new Date(now.getTime() + 24 * 60 * 60 * 1000) });

        return { error: false, token: accessToken };
    }

    connectionProvider = async (exec, host) => {
        let response;
        let tokenData = await this.cache.get("Token");

        if(!tokenData || tokenData.expiryDate < Date.now()) {
            if (!this.tenant?.nebim?.password) {
                this.throws("Nebim bağlantı ayarları eksik. Lütfen kurulum adımlarından Nebim bağlantısını kaydedin.", true);
            }

            this.logger.info2(`Getting token from Nebim V3 Integrator from ${host ?? this.tenant.nebim.host}`);

            response = await this.httpRequest.post(`${host ?? this.tenant.nebim.host}/IntegratorService/Connect`, {
                UserGroupCode: this.tenant.nebim.userGroup,
                UserName: this.tenant.nebim.user,
                Password: CryptoHelper.decrypt(this.tenant.nebim.password),
                Validate: true
            });

            if(response.data["Exception"]) this.throws(response.data["Exception"]);

            let accessToken = response.data["Token"];
            const now = new Date();

            if (!accessToken) this.throws("Something went wrong while connecting Nebim V3 Integrator");

            tokenData = { token: accessToken, expiryDate: new Date(now.getTime() + 24 * 60 * 60 * 1000) };

            await this.cache.set("Token", tokenData);
        }

        const data = await exec({
            "Token": tokenData.token,
            "Content-Type": "application/json"
        });

        // Preserve the HTTP error (including response status/body) so legal
        // consent audit records can store the target system's raw response.
        if (data instanceof Error) throw data;

        if (!data || typeof data !== "object") {
            this.throws("Nebim V3 Integrator returned invalid response");
        }

        if (data["StatusCode"] >= HttpStatusCodes.BAD_REQUEST.code) {
            const error = new Error(data["ExceptionMessage"] || "Nebim V3 Integrator request failed");
            error.data = data;
            error.status = data["StatusCode"];
            throw error;
        }

        return data;
    }

    runProc = async (procName, parameters) => await this.connectionProvider(async headers => {
        const response = await this.httpRequest.post(`${this.tenant.nebim.host}/IntegratorService/RunProc`, {
            "ProcName": procName,
            ...normalizeRunProcParameters(parameters)
        }, {
            headers: headers
        });

        if (response instanceof Error) return response;
        return response.data;
    })

    runProcReturnSingle = async (procName, parameters) => await this.connectionProvider(async headers => {
        const response = await this.httpRequest.post(`${this.tenant.nebim.host}/IntegratorService/RunProcReturnSingle`, {
            "ProcName": procName,
            ...normalizeRunProcParameters(parameters)
        }, {
            headers: headers
        });

        if (response instanceof Error) return response;
        return response.data ?? {};
    })

    getModel = async (type, key) => await this.connectionProvider(async headers => {
        let dictionary = { ModelType:0 };

        switch (type) {
            case "customer":
                dictionary = { ModelType: 3, CurrAccCode: key }
            default:
                break;
        }

        const response = await this.httpRequest.post(`${this.tenant.nebim.host}/IntegratorService/GetModel`, dictionary, {
            headers: headers
        });

        if (response instanceof Error) return response;
        return response.data;
    })

    post = async (data, customHeaders = {}) => await this.connectionProvider(async headers => {
        const response = await this.httpRequest.post(`${this.tenant.nebim.host}/IntegratorService/Post`, data, {
            headers: {
                ...customHeaders,
                ...headers
            }
        });

        if (response instanceof Error) return response;
        return response.data;
    })

    getUserInfo = async host => await this.connectionProvider(async headers => {
        this.logger.info2(`Getting user info from Nebim V3 Integrator from ${host ?? this.tenant.nebim.host}`);

        const response = await this.httpRequest.get(`${host ?? this.tenant.nebim.host}/IntegratorService/GetUserInfo`, {
            headers: headers
        });

        if (response instanceof Error) return response;
        return response.data;
    }, host)
}
