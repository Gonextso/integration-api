import CoreAPI from "../core/CoreAPI.js";

export default class ShopifyGqlAPI extends CoreAPI {
    constructor(tenant) {
        super(tenant);
        this.config = tenant.shopify;
    }

    query = async (query, variables) => {
        const MAX_RETRIES = 5;
        const MIN_DELAY_MS = 2000;
        const MAX_DELAY_MS = 20000;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.httpRequest.gpost(`https://${this.config.name}.myshopify.com/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`, {
                query,
                variables
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': this.config.decyrptedApiKey
                }
            });

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