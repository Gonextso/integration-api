export default {
    definitions: `
        query {
            metafieldDefinitions(ownerType: PRODUCT, first: 250) {
                edges {
                    node {
                        id
                        namespace
                        key
                    }
                }
            }
        }
    `
} 