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
    `
} 