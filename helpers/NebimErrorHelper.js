const FRIENDLY_MESSAGES = {
    ENOTFOUND: "Verilen adrese ulaşılamıyor",
    ECONNREFUSED: "Sunucu bağlantıyı reddetti",
    EADDRNOTAVAIL: "Geçersiz adres",
    ETIMEDOUT: "Bağlantı zaman aşımına uğradı",
    ECONNRESET: "Bağlantı kesildi",
    EHOSTUNREACH: "Hedef sunucuya ulaşılamıyor",
    WRONG_PROTOCOL_HTTPS: "Yanlış protokol — http:// deneyin",
    WRONG_PROTOCOL_HTTP: "Yanlış protokol — https:// deneyin",
};

const HTTPS_ON_HTTP_PATTERNS = [
    /EPROTO/i,
    /tls_get_more_records/i,
    /packet length too long/i,
    /SSL routines/i,
    /wrong version number/i,
    /ERR_SSL/i,
    /0A0000C6/i,
];

const HTTP_ON_HTTPS_PATTERNS = [
    /Parse Error/i,
    /HPE_INVALID_CONSTANT/i,
    /Expected HTTP\//i,
    /HTTP request to HTTPS/i,
    /client sent an HTTP request/i,
    /HTTP\/1\.\d+ request to HTTPS/i,
];

export function detectProtocolMismatch(error, host = "") {
    const message = [
        error?.message,
        error?.code,
        error?.cause?.message,
        error?.cause?.code,
        String(error),
    ]
        .filter(Boolean)
        .join(" ");

    const hostIsHttps = /^https:\/\//i.test(host || "");
    const hostIsHttp = /^http:\/\//i.test(host || "");

    const httpsOnHttp =
        HTTPS_ON_HTTP_PATTERNS.some((pattern) => pattern.test(message)) ||
        (hostIsHttps && /EPROTO|SSL|tls_/i.test(message));

    if (httpsOnHttp) {
        return { code: "WRONG_PROTOCOL_HTTPS" };
    }

    const httpOnHttps =
        HTTP_ON_HTTPS_PATTERNS.some((pattern) => pattern.test(message)) ||
        (hostIsHttp && /Parse Error|HPE_|Expected HTTP/i.test(message));

    if (httpOnHttps) {
        return { code: "WRONG_PROTOCOL_HTTP" };
    }

    return null;
}

export function friendlyNebimError(code, fallback = "Nebim bağlantı hatası") {
    if (!code) return fallback;
    return FRIENDLY_MESSAGES[code] ?? fallback;
}

export function buildNetworkErrorPayload(error, host = "") {
    if (!error) return null;

    const protocolMismatch = detectProtocolMismatch(error, host);
    if (protocolMismatch) {
        return {
            code: protocolMismatch.code,
            detail: error.message || String(error),
        };
    }

    const code = error.code || "UNKNOWN";
    const detail = error.message || String(error);
    return { code, detail };
}

export function buildErrorResponse(info, errorPayload) {
    return {
        info: info || friendlyNebimError(errorPayload?.code, errorPayload?.detail),
        content: errorPayload ? { error: errorPayload } : {},
    };
}
