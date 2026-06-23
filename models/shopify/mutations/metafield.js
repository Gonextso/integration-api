export default {
    createDefinition: `
        mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
                createdDefinition {
                    name
                    namespace
                    key
                    type {
                        name
                    }
                    access {
                        storefront
                        admin
                    }
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `,
    deleteDefinition: `
        mutation metafieldDefinitionDelete($id: ID!, $deleteAllMetafields: Boolean!) {
            metafieldDefinitionDelete(id: $id, deleteAllMetafields: $deleteAllMetafields) {
                deletedDefinitionId
                userErrors {
                    field
                    message
                }
            }
        }
    `,
    set: `
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields {
                    id
                    key
                    namespace
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `
} 