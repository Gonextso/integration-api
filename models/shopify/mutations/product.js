export default {
    sync: `
mutation createProductAsynchronous(
  $productSet: ProductSetInput!
  $synchronous: Boolean!
) {
  productSet(synchronous: $synchronous, input: $productSet) {
    product {
      id
      category { id }
      variants(first: 250) { nodes { id } }
      metafields(first: 250) {
        edges { node { namespace key value } }
      }
    }
    productSetOperation {
      id
      status
      userErrors { field message }
    }
    userErrors { field message }
  }
}`,
    create: `
mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
        product {
            id
            title
            description
            options {
                id
                name
                position
                optionValues {
                    id
                    name
                    hasVariants
                }
            }
            variants(first: 250) {
                edges {
                    node {
                        id
                        title
                        price
                        sku
                    }
                }
            }
        }
        userErrors {
            field
            message
        }
    }
}`,
    variantBulkUpdate: `
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    productVariants {
      id
      metafields(first: 2) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`
}