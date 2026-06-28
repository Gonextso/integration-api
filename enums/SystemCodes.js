export default class {
    static ERP = {
        V3_INTEGRATOR: 'V3_INTEGRATOR'
    }
    static ECOMMERCE = {
        SHOPIFY: 'SHOPIFY'
    }
    static PROCESS = {
        SYNC_CUSTOMER: 'SYNC_CUSTOMER',
        SYNC_ORDERS: 'SYNC_ORDERS',
        SYNC_CANCEL_ORDERS: 'SYNC_CANCEL_ORDERS',
        SYNC_FAILED_ORDERS: 'SYNC_FAILED_ORDERS',
        SYNC_ORDER_STATUS: 'SYNC_ORDER_STATUS',
        TOKEN_CHECK: 'TOKEN_CHECK',
        SYNC_PRODUCTS: 'SYNC_PRODUCTS',
        SYNC_FAILED_PRODUCTS: 'SYNC_FAILED_PRODUCTS',
        SYNC_MARKET_PRICES: 'SYNC_MARKET_PRICES',
        SYNC_MARKET_CONTENT: 'SYNC_MARKET_CONTENT',
        SETUP_TEST_ORDER: 'SETUP_TEST_ORDER'
    }
    static NEBIM_ORDER_STATUS = {
        ON_CARGO: 'ON-CARGO',
        CANCELLED: 'CANCELLED',
        INVOICED: 'INVOICED',
        SHIPPED: 'SHIPPED',
        INVOICE_RETURNED: 'INVOICE-RETURNED'
    }
    static NEBIM_SKU_FIELDS = {
        ITEM_CODE: 'ItemCode',
        COLOR_CODE: 'ColorCode',
        ITEM_DIM1_CODE: 'ItemDim1Code',
        ITEM_DIM2_CODE: 'ItemDim2Code',
        ITEM_DIM3_CODE: 'ItemDim3Code'
    }
    static SEPARATORS = {
        NONE: '',
        DASH: '-',
        UNDERSCORE: '_',
        COLON: ':',
        DOT: '.',
        SEMICOLON: ';',
        COMMA: ',',
    }
    static FIND_IN_STORE = {
        BARCODE_BATCH_SIZE: 140,
        METAFIELD_NAMESPACE: 'gonextso_nebim_app',
        STORES_METAFIELD_KEY: 'stores',
        INVENTORY_METAFIELD_KEY: 'find_in_store',
    }
    static MARKET_SYNC = {
        // priceListFixedPricesAdd accepts up to 250 prices per call.
        PRICE_BATCH_SIZE: 250,
        // translationsRegister accepts up to 250 translations per call.
        TRANSLATION_BATCH_SIZE: 250,
        // How many Shopify variant ids to resolve from SyncedBarcode per query chunk.
        BARCODE_LOOKUP_CHUNK: 200,
    }
    static DEFINITIONS = {
        NO_TRACKING_NUMBER: 'NO_TRACKING_NUMBER'
    }
    static PREFIXES = {
        SHOPIFY_FULFILLMENT_ORDER_IDS: 'shopify_fulfillment_order_ids'
    }
    static LIMIT_TYPE = {
        ORDER: 'order',
        PRODUCT_DETAILS: 'product_details'
    }
    static BILLING_PLANS = {
        BASIC: {
            KEY: 'BASIC',
            LIMITS: {
                ORDER: 5,
                PRODUCT_DETAILS: 100
            },
            REDENTION: {
                LOG: 1
            }
        },
        COMMUNITY: {
            KEY: 'COMMUNITY',
            LIMITS: {
                ORDER: 50,
                PRODUCT_DETAILS: 5000
            },
            REDENTION: {
                LOG: 5
            }
        },
        ENTERPRISE: {
            KEY: 'ENTERPRISE',
            LIMITS: {
                ORDER: 0,
                PRODUCT_DETAILS: 0
            },
            REDENTION: {
                LOG: 15
            }
        }
    }
}