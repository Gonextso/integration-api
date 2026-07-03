import CoreClass from "../core/CoreClass.js";
import NebimProductBusiness from "./nebim/ProductBusiness.js";
import ShopifyInventoryBusiness from "./shopify/InventoryBusiness.js";
import ShopifyProductBusiness from "./shopify/ProductBusiness.js";
import ShopifyFindInStoreBusiness from "./shopify/FindInStoreBusiness.js";
import ShopifyMarketPriceBusiness from "./shopify/MarketPriceBusiness.js";
import ShopifyTranslationBusiness from "./shopify/TranslationBusiness.js";
import ShopifyGqlAPI from "../apis/ShopifyGqlAPI.js";
import shopQueries from "../models/shopify/queries/shop.js";
import SystemCodes from "../enums/SystemCodes.js";
import Tenant from "../models/db/postgres/Tenant.js";
import ProductSyncedBatch from "../models/db/postgres/ProductSyncedBatch.js";
import ProductBatchLog from "../models/db/postgres/ProductBatchLog.js";
import SyncedBarcode from "../models/db/postgres/SyncedBarcode.js";


export default class ProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    syncDetailsNebimToShopify = async (startDate, _) => {
        try {
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
            const shopifyProductBusiness = new ShopifyProductBusiness(this.tenant);
    
            this.logger.info2(`Sync product details started from ${startDate}`);
    
            const detailList = await nebimProductBusiness.getProductDetailList(startDate);
            console.log(`detailList length: ${detailList.length}`);
            
            await shopifyProductBusiness.syncProductsDetailBulk(detailList, [], { startDate });
        } catch (error) {
            this.logger.error(new Error(`Error syncing product details from ${startDate}, error: ${error.message}`));
        } finally {
            this.logger.info2(`Sync product details finished from ${startDate}`);
        }
    }

    syncInventoryNebimToShopify = async (startDate, _) => {
        try {
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
            const shopifyInventoryBusiness = new ShopifyInventoryBusiness(this.tenant);
    
            this.logger.info2(`Sync inventory started from ${startDate}`);
    
            const inventories = await nebimProductBusiness.fetchInventories(startDate);
                    
            shopifyInventoryBusiness.syncInventoryBulk(inventories);
        } catch (error) {
            this.logger.error(new Error(`Error syncing inventory from ${startDate}, error: ${error.message}`));
        } finally {
            this.logger.info2(`Sync inventory finished from ${startDate}`);
        }
    }

    syncFindInStoreNebimToShopify = async _ => {
        try {
            if (this.tenant.shopify?.billing?.planKey !== SystemCodes.BILLING_PLANS.ENTERPRISE.KEY) {
                await Tenant.disableFindInStoreSchedule(this.tenant.id);
                this.logger.info2("Sync find in store skipped: tenant is not on ENTERPRISE plan; schedule disabled.");
                return;
            }

            const nebimProductBusiness = new NebimProductBusiness(this.tenant);
            const findInStoreBusiness = new ShopifyFindInStoreBusiness(this.tenant);
            const batchSize = SystemCodes.FIND_IN_STORE.BARCODE_BATCH_SIZE;

            this.logger.info2("Sync find in store started");

            try {
                const stores = await nebimProductBusiness.fetchStoreInfo();
                await findInStoreBusiness.syncStoresMetafieldIfChanged(stores);
            } catch (storeError) {
                this.logger.error(new Error(`Find in store store info step failed, continuing with inventory sync: ${storeError.message}`));
            }

            const variantMap = await findInStoreBusiness.fetchVariantMapByBarcode();
            if (!variantMap || variantMap.size === 0) {
                this.logger.info2("Sync find in store skipped: no barcodes found on Shopify.");
                return;
            }

            const barcodes = [...variantMap.keys()];
            const chunks = [];
            for (let i = 0; i < barcodes.length; i += batchSize) {
                chunks.push(barcodes.slice(i, i + batchSize));
            }

            const results = await Promise.allSettled(
                chunks.map(async barcodeBatch => {
                    const grouped = await nebimProductBusiness.fetchFindInStoreByBarcodes(barcodeBatch);
                    await findInStoreBusiness.syncVariantInventoryForBarcodes(grouped, variantMap);
                })
            );

            const failed = results.filter(result => result.status === "rejected");
            if (failed.length) {
                this.logger.error(new Error(`Find in store sync completed with ${failed.length} failed batch(es).`));
            }
        } catch (error) {
            this.logger.error(new Error(`Error syncing find in store, error: ${error.message}`));
        } finally {
            this.logger.info2("Sync find in store finished");
        }
    }

    /**
     * Adım adım batch logu yazar. Hata fırlatmaz — log yazılamasa bile ana akış devam eder.
     */
    #logBatchStep = async (batchId, level, step, message, data = undefined) => {
        if (!batchId) return;
        try {
            await ProductBatchLog.create({ productSyncedBatchId: batchId, level, step, message, data });
        } catch (err) {
            this.logger.warn(`ProductBatchLog yazılamadı (${step}): ${err?.message}`);
        }
    }

    #isEnterprisePlan = () => this.tenant.shopify?.billing?.planKey === SystemCodes.BILLING_PLANS.ENTERPRISE.KEY
        || this.tenant.shopify?.isEnterprise === true;

    // Live Shopify Plus check via Admin GraphQL. This is the real runtime gate.
    #isLiveShopifyPlus = async () => {
        try {
            const api = new ShopifyGqlAPI(this.tenant);
            const data = await api.query(shopQueries.plan);
            return data?.data?.shop?.plan?.shopifyPlus === true;
        } catch (error) {
            this.logger.error(new Error(`Live Shopify Plus check failed: ${error.message}`));
            return false;
        }
    }

    // Defense-in-depth gate: requires ENTERPRISE plan AND a live Shopify Plus store.
    // Disables the schedule and returns false when not allowed.
    #ensureMarketSyncAllowed = async label => {
        if (!this.#isEnterprisePlan()) {
            await Tenant.disableMarketSyncSchedule(this.tenant.id);
            this.logger.info2(`${label} skipped: tenant is not on ENTERPRISE plan; schedule disabled.`);
            return false;
        }

        const isPlus = await this.#isLiveShopifyPlus();
        if (!isPlus) {
            await Tenant.disableMarketSyncSchedule(this.tenant.id);
            this.logger.info2(`${label} skipped: store is not Shopify Plus (live check); schedule disabled.`);
            return false;
        }

        return true;
    }

    // Resolves barcode -> { variantId, productId } from SyncedBarcode in chunks.
    #resolveBarcodeMap = async barcodes => {
        const unique = [...new Set((barcodes ?? []).filter(Boolean))];
        const map = new Map();
        const chunk = SystemCodes.MARKET_SYNC.BARCODE_LOOKUP_CHUNK;

        for (let i = 0; i < unique.length; i += chunk) {
            const slice = unique.slice(i, i + chunk);
            const docs = await SyncedBarcode.find({ barcode: { $in: slice }, tenant: this.tenant.id });
            for (const doc of docs ?? []) {
                if (doc.variantId || doc.productId) {
                    map.set(doc.barcode, { variantId: doc.variantId, productId: doc.productId });
                }
            }
        }

        return map;
    }

    syncMarketPricesNebimToShopify = async (startDate, _) => {
        let batchId = null;
        try {
            if (!(await this.#ensureMarketSyncAllowed("Market price sync"))) return;

            const marketPriceBusiness = new ShopifyMarketPriceBusiness(this.tenant);
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);

            this.logger.info2(`Market price sync started from ${startDate}`);

            const priceListsByCurrency = await marketPriceBusiness.fetchPriceListsByCurrency();
            const currencies = [...priceListsByCurrency.keys()];

            if (!currencies.length) {
                this.logger.info2("Market price sync skipped: no currency price lists found on Shopify.");
                return;
            }

            const batch = await ProductSyncedBatch.create({
                process: SystemCodes.PROCESS.SYNC_MARKET_PRICES,
                request: { startDate, endDate: null },
                tenant: this.tenant.id,
                traceId: this.traceId,
            });
            batchId = batch?.id ?? null;

            await this.#logBatchStep(batchId, 'INFO', 'FETCH_PRICE_LISTS',
                `Shopify'da ${currencies.length} para birimi için fiyat listesi bulundu: ${currencies.join(', ')}`,
                { currencies });

            const settled = await nebimProductBusiness.fetchPricesByCurrency(startDate, currencies);

            const allBarcodes = new Set();
            for (const r of settled) {
                if (r.status === 'fulfilled') {
                    for (const bc of r.value.prices.keys()) allBarcodes.add(bc);
                }
            }
            const barcodeMap = await this.#resolveBarcodeMap([...allBarcodes]);

            await this.#logBatchStep(batchId, 'INFO', 'RESOLVE_BARCODES',
                `${allBarcodes.size} barkodun ${barcodeMap.size} tanesi Shopify varyantına eşlendi`,
                { totalBarcodes: allBarcodes.size, resolved: barcodeMap.size });

            let totalSuccess = 0;
            let totalError = 0;
            const perCurrency = [];

            for (let i = 0; i < settled.length; i++) {
                const r = settled[i];
                const currencyCode = currencies[i];
                const priceList = priceListsByCurrency.get(currencyCode);

                if (r.status === 'rejected') {
                    totalError++;
                    perCurrency.push({ currencyCode, status: 'nebim_failed' });
                    await this.#logBatchStep(batchId, 'ERROR', 'NEBIM_PRICES',
                        `Nebim fiyat çağrısı başarısız (${currencyCode}): ${r.reason?.message ?? r.reason}`, { currencyCode });
                    continue;
                }

                const priceMap = r.value.prices;
                const prices = [];
                for (const [barcode, price] of priceMap) {
                    const resolved = barcodeMap.get(barcode);
                    if (!resolved?.variantId) continue;
                    prices.push({ variantId: resolved.variantId, amount: price.sale_price, compareAmount: price.compare_at_price });
                }

                const result = await marketPriceBusiness.addFixedPrices(priceList.priceListId, currencyCode, prices);
                totalSuccess += result.success;
                totalError += result.error;
                perCurrency.push({ currencyCode, priceListId: priceList.priceListId, nebimBarcodes: priceMap.size, written: prices.length, ...result });

                await this.#logBatchStep(batchId, result.error ? 'WARN' : 'INFO', 'WRITE_PRICES',
                    `${currencyCode}: ${prices.length} varyant fiyatı gönderildi — başarılı: ${result.success}, hatalı: ${result.error}`,
                    { currencyCode, written: prices.length, ...result });
            }

            await ProductSyncedBatch.update({ id: batchId }, {
                numbers: { total: totalSuccess + totalError, createProductSuccess: totalSuccess, createProductError: totalError },
                isErrorLogExistsForThisBatch: totalError > 0,
            });

            await this.#logBatchStep(batchId, totalError ? 'WARN' : 'INFO', 'DONE',
                `Market fiyat senkronu tamamlandı — başarılı: ${totalSuccess}, hatalı: ${totalError}`,
                { perCurrency });
        } catch (error) {
            this.logger.error(new Error(`Error syncing market prices from ${startDate}, error: ${error.message}`));
            await this.#logBatchStep(batchId, 'ERROR', 'FATAL', `Market fiyat senkronu hata: ${error.message}`);
        } finally {
            this.logger.info2(`Market price sync finished from ${startDate}`);
        }
    }

    syncMarketContentNebimToShopify = async (startDate, _) => {
        let batchId = null;
        try {
            if (!(await this.#ensureMarketSyncAllowed("Market content sync"))) return;

            const translationBusiness = new ShopifyTranslationBusiness(this.tenant);
            const nebimProductBusiness = new NebimProductBusiness(this.tenant);

            this.logger.info2(`Market content sync started from ${startDate}`);

            const locales = await translationBusiness.fetchTranslatableLocales();
            if (!locales.length) {
                this.logger.info2("Market content sync skipped: no published non-primary locales.");
                return;
            }

            // Map locale -> Nebim LangCode using the language portion, uppercased ('en-US' -> 'EN').
            const localeLangPairs = locales.map(l => ({
                locale: l.locale,
                langCode: String(l.locale).split('-')[0].toUpperCase(),
            }));
            const langCodes = [...new Set(localeLangPairs.map(p => p.langCode))];

            const batch = await ProductSyncedBatch.create({
                process: SystemCodes.PROCESS.SYNC_MARKET_CONTENT,
                request: { startDate, endDate: null },
                tenant: this.tenant.id,
                traceId: this.traceId,
            });
            batchId = batch?.id ?? null;

            await this.#logBatchStep(batchId, 'INFO', 'FETCH_LOCALES',
                `${locales.length} yayınlanmış dil bulundu: ${localeLangPairs.map(p => `${p.locale}->${p.langCode}`).join(', ')}`,
                { locales: localeLangPairs });

            const settled = await nebimProductBusiness.fetchDetailsByLang(startDate, langCodes);
            const byLang = new Map();
            for (let i = 0; i < settled.length; i++) {
                const r = settled[i];
                if (r.status === 'fulfilled') {
                    byLang.set(r.value.langCode, r.value.products);
                } else {
                    await this.#logBatchStep(batchId, 'ERROR', 'NEBIM_DETAILS',
                        `Nebim detay çağrısı başarısız (${langCodes[i]}): ${r.reason?.message ?? r.reason}`, { langCode: langCodes[i] });
                }
            }

            const allBarcodes = new Set();
            for (const products of byLang.values()) {
                for (const p of products) {
                    for (const v of p.variants) if (v.barcode) allBarcodes.add(v.barcode);
                }
            }
            const barcodeMap = await this.#resolveBarcodeMap([...allBarcodes]);

            // erp_id -> Shopify productId (barcodes are identical across languages).
            const productIdByErp = new Map();
            for (const products of byLang.values()) {
                for (const p of products) {
                    if (productIdByErp.has(p.erp_id)) continue;
                    for (const v of p.variants) {
                        const resolved = barcodeMap.get(v.barcode);
                        if (resolved?.productId) { productIdByErp.set(p.erp_id, resolved.productId); break; }
                    }
                }
            }

            const productIds = [...new Set([...productIdByErp.values()])];
            const contentByProduct = await translationBusiness.fetchTranslatableContent(productIds);

            await this.#logBatchStep(batchId, 'INFO', 'RESOLVE_PRODUCTS',
                `${productIdByErp.size} ürün Shopify ürününe eşlendi; ${contentByProduct.size} ürün için çevrilebilir içerik bulundu`,
                { mapped: productIdByErp.size, withContent: contentByProduct.size });

            let totalSuccess = 0;
            let totalError = 0;
            let totalSkipped = 0;
            const perLocale = [];

            for (const { locale, langCode } of localeLangPairs) {
                const products = byLang.get(langCode);
                if (!products) {
                    perLocale.push({ locale, langCode, status: 'no_nebim_data' });
                    continue;
                }

                let success = 0;
                let error = 0;
                let skipped = 0;
                for (const p of products) {
                    const productId = productIdByErp.get(p.erp_id);
                    if (!productId) { skipped++; continue; }
                    const contentMap = contentByProduct.get(productId);
                    const entries = {
                        [ShopifyTranslationBusiness.KEYS.TITLE]: p.title,
                        [ShopifyTranslationBusiness.KEYS.BODY]: p.description,
                    };
                    const res = await translationBusiness.registerProductTranslations(productId, locale, entries, contentMap);
                    success += res.success;
                    error += res.error;
                    skipped += res.skipped;
                }

                totalSuccess += success;
                totalError += error;
                totalSkipped += skipped;
                perLocale.push({ locale, langCode, success, error, skipped });

                await this.#logBatchStep(batchId, error ? 'WARN' : 'INFO', 'WRITE_TRANSLATIONS',
                    `${locale} (${langCode}): başarılı ${success}, hatalı ${error}, atlandı ${skipped}`,
                    { locale, langCode, success, error, skipped });
            }

            await ProductSyncedBatch.update({ id: batchId }, {
                numbers: {
                    total: totalSuccess + totalError,
                    createProductSuccess: totalSuccess,
                    createProductError: totalError,
                    createProductSkippedTotal: totalSkipped,
                },
                isErrorLogExistsForThisBatch: totalError > 0,
            });

            await this.#logBatchStep(batchId, totalError ? 'WARN' : 'INFO', 'DONE',
                `Market içerik senkronu tamamlandı — başarılı: ${totalSuccess}, hatalı: ${totalError}, atlandı: ${totalSkipped}`,
                { perLocale });
        } catch (error) {
            this.logger.error(new Error(`Error syncing market content from ${startDate}, error: ${error.message}`));
            await this.#logBatchStep(batchId, 'ERROR', 'FATAL', `Market içerik senkronu hata: ${error.message}`);
        } finally {
            this.logger.info2(`Market content sync finished from ${startDate}`);
        }
    }
}