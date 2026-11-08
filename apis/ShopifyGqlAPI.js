import CoreAPI from "../core/CoreAPI.js";
import ShopifyTokenService from "../helpers/ShopifyTokenService.js";

export default class ShopifyGqlAPI extends CoreAPI {
    constructor(tenant) {
        super(tenant);
        this.config = tenant.shopify;
    }

    // Resolved per call (not once per request) so long-running syncs survive token rotation.
    accessToken = async (rejectedToken) => {
        const tenantId = this.tenant?.id ?? this.tenant?._id;
        if (tenantId && this.config?.name) {
            const token = await ShopifyTokenService.getAccessToken(String(tenantId), `${this.config.name}.myshopify.com`, { rejectedToken });
            if (token) return token;
        }

        return this.config.decyrptedApiKey ?? this.config.decryptedApiKey;
    }

    // POSTs to the Admin GraphQL endpoint; on 401 retries once with a refreshed token.
    postGraphql = async (query, variables) => {
        const url = `https://${this.config.name}.myshopify.com/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`;
        const send = token => this.httpRequest.gpost(url, { query, variables }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': token
            }
        });

        const token = await this.accessToken();
        try {
            return await send(token);
        } catch (error) {
            if (error?.response?.status !== 401) throw error;

            const retryToken = await this.accessToken(token);
            if (!retryToken || retryToken === token) throw error;
            return send(retryToken);
        }
    }

    query = async (query, variables) => {
        const MAX_RETRIES = 5;
        const MIN_DELAY_MS = 2000;
        const MAX_DELAY_MS = 20000;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.postGraphql(query, variables);

            // Keep the original HTTP error intact for callers that persist the
            // target response in the consent audit trail.
            if (response instanceof Error) throw response;
            if (!response?.data) throw new Error('Shopify returned an empty GraphQL response');

            const data = response.data;
            const errors = data?.errors;
            const isThrottled = Array.isArray(errors) && errors.some(err => err?.extensions?.code === "THROTTLED");

            // GraphQL errors varsa logla (boş array kontrolü)
            if (Array.isArray(errors) && errors.length > 0) {
                const error = new Error('GraphQL Errors in query response');
                error.graphqlErrors = errors;
                error.query = query;
                error.variables = variables;
                this.logger.error(error);
            }

            if (!isThrottled || attempt === MAX_RETRIES) {
                return data;
            }

            const exponentialDelay = Math.min(MIN_DELAY_MS * (2 ** (attempt - 1)), MAX_DELAY_MS);
            const jitter = Math.floor(Math.random() * 500);
            const delayMs = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
            this.logger.warn2(`Shopify throttled. Retrying attempt ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        return null;
    }

    getShopInfo = async (shop, accessToken) => {
        const shopUrl = `https://${shop}.myshopify.com/admin/api/${process.env.SHOPIFY_API_VERSION}/shop.json`;
    
        const response = await this.httpRequest.get(shopUrl, {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            }
        });
    
        return response.data.shop;
    }

    getAccessToken = async (shop, code) => {
        const accessTokenPayload = {
            client_id: process.env.SHOPIFY_CLIENT_ID,
            client_secret: process.env.SHOPIFY_CLIENT_SECRET,
            code,
        };

        const response = await this.httpRequest.post(`https://${shop}/admin/oauth/access_token`, accessTokenPayload);

        return response.data.access_token;
    }
}
