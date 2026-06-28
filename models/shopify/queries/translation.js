export default {
    // Shop locales. Used to map Nebim LangCode -> Shopify locale and to skip unpublished locales.
    shopLocales: `
query ShopLocales {
    shopLocales {
        locale
        primary
        published
    }
}`,
    // Translatable content (with digests) for a set of product resource ids.
    // digest is required by translationsRegister.
    translatableResourcesByIds: `
query TranslatableResourcesByIds($ids: [ID!]!) {
    translatableResourcesByIds(resourceIds: $ids, first: 250) {
        nodes {
            resourceId
            translatableContent {
                key
                value
                digest
                locale
            }
        }
    }
}`,
}
