export default {
    definitionsByOwnerType: `
        query metafieldDefinitions($ownerType: MetafieldOwnerType!) {
            metafieldDefinitions(ownerType: $ownerType, first: 250) {
                edges {
                    node {
                        id
                        namespace
                        key
                        type {
                            name
                        }
                    }
                }
            }
        }
    `
} 