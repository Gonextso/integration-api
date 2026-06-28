export default {
    // Adds/overrides fixed prices for variants in a given price list (per-currency catalog).
    // Up to 250 prices per call.
    fixedPricesAdd: `
mutation PriceListFixedPricesAdd($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
    priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
        prices {
            variant {
                id
            }
        }
        userErrors {
            field
            code
            message
        }
    }
}`,
}
