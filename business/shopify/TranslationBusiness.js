import ShopifyGqlAPI from "../../apis/ShopifyGqlAPI.js";
import CoreClass from "../../core/CoreClass.js";
import SystemCodes from "../../enums/SystemCodes.js";
import translationQueries from "../../models/shopify/queries/translation.js";
import translationMutations from "../../models/shopify/mutations/translation.js";

// Product translatable content keys we sync from Nebim.
const TRANSLATABLE_KEYS = {
    TITLE: "title",
    BODY: "body_html",
};

export default class ShopifyTranslationBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new ShopifyGqlAPI(tenant);
        this.lookupChunk = SystemCodes.MARKET_SYNC.BARCODE_LOOKUP_CHUNK;
    }

    /**
     * Published, non-primary shop locales. The primary locale is the source content and
     * cannot be translated, so it is excluded.
     * Returns Array<{ locale, primary, published }>.
     */
    fetchTranslatableLocales = async () => {
        const data = await this.api.query(translationQueries.shopLocales);
        if (!data || data.errors) {
            this.logger.error("GraphQL Errors while fetching shop locales:", JSON.stringify(data?.errors ?? data));
            return [];
        }

        const locales = data?.data?.shopLocales ?? [];
        return locales.filter(l => l?.published && !l?.primary);
    }

    /**
     * Resolves digests for translatable content of the given product resource ids.
     * Returns Map<productId, Map<key, { value, digest }>>.
     */
    fetchTranslatableContent = async productIds => {
        const ids = [...new Set((productIds ?? []).filter(Boolean))];
        const result = new Map();

        for (let i = 0; i < ids.length; i += this.lookupChunk) {
            const chunk = ids.slice(i, i + this.lookupChunk);
            const data = await this.api.query(translationQueries.translatableResourcesByIds, { ids: chunk });
            if (!data || data.errors) {
                this.logger.error("GraphQL Errors while fetching translatable content:", JSON.stringify(data?.errors ?? data));
                continue;
            }

            for (const node of data?.data?.translatableResourcesByIds?.nodes ?? []) {
                if (!node?.resourceId) continue;
                const keyMap = new Map();
                for (const content of node.translatableContent ?? []) {
                    keyMap.set(content.key, { value: content.value, digest: content.digest });
                }
                result.set(node.resourceId, keyMap);
            }
        }

        return result;
    }

    /**
     * Registers title/body translations for a single product in a single locale.
     * entries: { title?, body_html? } — empty/missing values are skipped.
     * contentMap: Map<key, { value, digest }> from fetchTranslatableContent for this product.
     * Returns { success, error, skipped }.
     */
    registerProductTranslations = async (productId, locale, entries, contentMap) => {
        const translations = [];

        for (const [key, value] of Object.entries(entries ?? {})) {
            const trimmed = typeof value === "string" ? value.trim() : value;
            if (!trimmed) continue;

            const source = contentMap?.get(key);
            if (!source?.digest) {
                // No digest -> Shopify has no translatable source for this key; cannot register.
                continue;
            }

            translations.push({
                locale,
                key,
                value: String(trimmed),
                translatableContentDigest: source.digest,
            });
        }

        if (!translations.length) {
            return { success: 0, error: 0, skipped: 1 };
        }

        const data = await this.api.query(translationMutations.register, {
            resourceId: productId,
            translations,
        });
        const userErrors = data?.data?.translationsRegister?.userErrors ?? [];

        if (!data || data.errors || userErrors.length) {
            this.logger.error(
                `translationsRegister failed for ${productId} (${locale}): ${JSON.stringify(data?.errors ?? userErrors)}`
            );
            return { success: 0, error: translations.length, skipped: 0 };
        }

        return { success: translations.length, error: 0, skipped: 0 };
    }

    static get KEYS() {
        return TRANSLATABLE_KEYS;
    }
}
