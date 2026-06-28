export default {
    // Registers translations for a single resource (e.g. a product) in a given locale.
    // Each translation requires the digest of the source content (translatableContentDigest).
    register: `
mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
        translations {
            key
            value
            locale
        }
        userErrors {
            field
            message
        }
    }
}`,
}
