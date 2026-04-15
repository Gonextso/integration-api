export default {
  openOrders: `
query Orders($cursor: String) {
    orders(first: 250, after: $cursor, query: "(status:open OR status:cancelled) AND created_at:>='@start_date' AND created_at:<='@end_date'") {
        pageInfo {
            hasNextPage
        }
        edges {
            cursor
            node {
                cancelReason
                createdAt
                currencyCode
                fullyPaid
                id
                name
                netPayment
                note
                totalDiscounts
                totalPrice
                totalShippingPriceSet {
                    shopMoney {
                        amount
                        currencyCode
                    }
                }
                billingAddress {
                    address1
                    address2
                    city
                    id
                    lastName
                    phone
                    zip
                }
                customer {
                    displayName
                    email
                    firstName
                    id
                    lastName
                    phone
                    note
                    emailMarketingConsent {
                      marketingState
                      consentUpdatedAt
                    }
                    smsMarketingConsent {
                      marketingState
                      consentUpdatedAt
                    }
                }
                lineItems(first: 250) {
                    nodes {
                        discountedUnitPrice
                        id
                        originalUnitPrice
                        quantity
                        refundableQuantity
                        sku
                        totalDiscount
                        nonFulfillableQuantity
                        variant {
                            barcode
                        }
                    }
                }
                shippingAddress {
                    address1
                    address2
                    city
                    firstName
                    id
                    name
                    lastName
                    name
                    phone
                    zip
                }
                tags
                metafields(first: 10, namespace: "gonextso_nebim_app") {
                  edges {
                    node {
                      namespace
                      key
                      value
                    }
                  }
                }
                fulfillmentOrders(first: 1) {
                  nodes {
                    id
                    status
                    requestStatus
                    lineItems(first: 20) {
                      nodes {
                        id
                        remainingQuantity
                        totalQuantity
                        lineItem {
                          id
                          sku
                          variant { barcode }
                        }
                      }
                    }
                  }
                }
            }
        }
    }
}`,
  orderByIds: `
query GetOrdersById($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      cancelReason
      createdAt
      currencyCode
      fullyPaid
      id
      name
      netPayment
      note
      totalDiscounts
      totalPrice
      totalShippingPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      billingAddress {
        address1
        address2
        city
        id
        lastName
        phone
        zip
      }
      customer {
        displayName
        email
        firstName
        id
        lastName
        phone
        note
        emailMarketingConsent {
          marketingState
          consentUpdatedAt
        }
        smsMarketingConsent {
          marketingState
          consentUpdatedAt
        }
      }
      lineItems(first: 250) {
        nodes {
          discountedUnitPrice
          id
          originalUnitPrice
          quantity
          refundableQuantity
          sku
          totalDiscount
          nonFulfillableQuantity
          variant {
            barcode
          }
        }
      }
      shippingAddress {
        address1
        address2
        city
        firstName
        id
        lastName
        name
        phone
        zip
      }
      tags
      metafields(first: 10, namespace: "gonextso_nebim_app") {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
      fulfillmentOrders(first: 1) {
          nodes {
            id
            status
            requestStatus
            lineItems(first: 20) {
              nodes {
                id
                remainingQuantity
                totalQuantity
                lineItem {
                  id
                  sku
                  variant { barcode }
                }
              }
            }
          }
        }
    }
  }
}`,
  fulfillmentOrdersByOrderId: `
query FulfillmentOrders($orderId: ID!) {
  order(id: $orderId) {
    fulfillmentOrders(first: 10) {
      nodes {
        id
        lineItems(first: 100) {
          nodes {
            id
            quantity: totalQuantity
          }
        }
      }
    }
  }
}`
}