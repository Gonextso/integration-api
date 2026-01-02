import chalk from "chalk";
import CLSHelper from "./CLSHelper.js";
import StringHelper from "./StringHelper.js";

export default class LogHelper {
    constructor(tenant) {
        this.tenant = tenant;
    }

    #addTenantNameToMessage = _ => chalk.cyan(`[${this.tenant ? this.tenant.name.toUpperCase() : "NO_TENANT"}]`)
    #addRequestIdToMessage = _ => `[${CLSHelper.get('traceId') ?? "INTERNAL"}]`

    info = (message) => {
        console.log(chalk.green("[Info]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), StringHelper.truncateString(message));
    }

    info2 = (message) => {
        console.log(chalk.green("[Info]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.magenta(StringHelper.truncateString(message)));
    }

    info3 = (message) => {
        console.log(chalk.green("[Info]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.yellowBright(StringHelper.truncateString(message)));
    }

    info4 = (message) => {
        console.log(chalk.green("[Info]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.blueBright(StringHelper.truncateString(message)));
    }

    warn = (message) => {
        console.log(chalk.yellow("[Warning]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.yellow(StringHelper.truncateString(message)));
    }

    warn2 = (message) => {
        console.log(chalk.yellow("[Warning]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.rgb(247, 96, 20)(StringHelper.truncateString(message)));
    }

    error = (error) => {
        let errorData = {};

        if (error instanceof Error) {
            // Error nesnesi ise message, stack ve diğer önemli özellikleri al
            errorData = {
                message: error.message || 'Unknown error',
                stack: error.stack || 'No stack trace available',
                name: error.name || 'Error'
            };

            // Axios error gibi özel error tipleri için ek bilgiler
            if (error.response) {
                errorData.response = {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                };
            }
            if (error.request) {
                errorData.request = {
                    method: error.config?.method,
                    url: error.config?.url
                };
            }
            if (error.code) {
                errorData.code = error.code;
            }
            
            // Prisma error özelliklerini yakala
            if (error.meta) {
                errorData.meta = error.meta;
            }
            if (error.clientVersion) {
                errorData.clientVersion = error.clientVersion;
            }
            if (error.batchRequestIdx !== undefined) {
                errorData.batchRequestIdx = error.batchRequestIdx;
            }
            
            // GraphQL errors gibi özel özellikleri yakala
            if (error.graphqlErrors) {
                errorData.graphqlErrors = error.graphqlErrors;
            }
            if (error.query) {
                // Query çok uzun olabilir, bu yüzden kısalt
                errorData.query = StringHelper.truncateString(error.query, 500);
            }
            if (error.variables) {
                errorData.variables = error.variables;
            }
            if (error.cause) {
                errorData.cause = error.cause instanceof Error ? {
                    message: error.cause.message,
                    stack: error.cause.stack,
                    name: error.cause.name
                } : error.cause;
            }
            
            // Error nesnesindeki diğer özel özellikleri de ekle
            Object.keys(error).forEach(key => {
                if (!['message', 'stack', 'name', 'response', 'request', 'code', 'graphqlErrors', 'query', 'variables', 'cause', 'meta', 'clientVersion', 'batchRequestIdx'].includes(key)) {
                    errorData[key] = error[key];
                }
            });
        } else if (typeof error === 'string') {
            // String ise direkt kullan
            errorData = {
                message: error,
                stack: 'No stack trace available'
            };
        } else if (error && typeof error === 'object') {
            // Obje ise message ve stack'i çıkar, yoksa tüm objeyi serialize et
            errorData = {
                message: error.message || error.toString?.() || JSON.stringify(error),
                stack: error.stack || 'No stack trace available',
                ...error
            };
        } else {
            // Diğer durumlar için string'e çevir
            errorData = {
                message: String(error) || 'Unknown error',
                stack: 'No stack trace available'
            };
        }

        // Undefined değerleri temizle
        const cleanedErrorData = Object.fromEntries(
            Object.entries(errorData).filter(([_, value]) => value !== undefined)
        );

        console.log(chalk.red("[Error]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.red(JSON.stringify(cleanedErrorData)));
    }

    success = (message) => {
        console.log(chalk.blue("[Success]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.green(StringHelper.truncateString(message)));
    }

    success2 = (message) => {
        console.log(chalk.blue("[Success]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), chalk.cyan(StringHelper.truncateString(message)));
    }

    request = (message) => {
        console.log(chalk.green("[Info]"), this.#addTenantNameToMessage(), this.#addRequestIdToMessage(), StringHelper.truncateString(message));
    }
}