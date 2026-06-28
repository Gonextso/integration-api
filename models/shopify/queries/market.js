export default {
    // All price lists with their currency. Used to map a Nebim CurrencyCode -> Shopify priceList.
    // A price list belongs to a catalog which in turn is attached to one or more markets.
    priceLists: `
query PriceLists($cursor: String) {
    priceLists(first: 50, after: $cursor) {
        edges {
            cursor
            node {
                id
                name
                currency
                catalog {
                    id
                    title
                    status
                }
            }
        }
        pageInfo {
            hasNextPage
        }
    }
}`,
    // Enabled markets and their base currency. Useful for diagnostics / logging.
    markets: `
query Markets($cursor: String) {
    markets(first: 50, after: $cursor) {
        edges {
            cursor
            node {
                id
                name
                enabled
                primary
                currencySettings {
                    baseCurrency {
                        currencyCode
                    }
                }
            }
        }
        pageInfo {
            hasNextPage
        }
    }
}`,
}
