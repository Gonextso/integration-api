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
        TOKEN_CHECK: 'TOKEN_CHECK'
    }
    static BILLING_PLANS = {
        BASIC: {
            KEY: 'BASIC',
            DESCRIPTION: 'Başlangıç ve uygulamanın test edilmesi için ideal bir plan',
            DETAILS: [
                "7 günlük log kaydı",
                "5 sipariş aktarımı"
            ],
            PRICE: 0,
            DISCOUNTED_PRICE: 0,
            CURRENCY: 'USD'
        },
        COMMUNITY: {
            KEY: 'COMMUNITY',
            DESCRIPTION: 'Orta ölçekli işletmeler için tavsiye edilen plan',
            DETAILS: [
                "7 günlük log kaydı",
                "500 sipariş aktarımı"
            ],
            PRICE: 129.99,
            DISCOUNTED_PRICE: 99.99,
            CURRENCY: 'USD'
        },
        ENTERPRISE: {
            KEY: 'ENTERPRISE',
            DESCRIPTION: 'Kesintisiz destek alabileceğiniz destek portalı ile birlikte uygulamayı limitsiz kullanabileceğiniz plan',
            DETAILS: [
                "30 günlük log kaydı",
                "Sınırsız sipariş aktarımı",
                "Uygulama içi destek/talep portalı",
                "Aktarım sıklıkları ayarlanabilir"
            ],
            PRICE: 269.99,
            DISCOUNTED_PRICE: 249.99,
            CURRENCY: 'USD'
        }
    }
}