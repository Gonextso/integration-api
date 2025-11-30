import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: ShopifyObjectHelper } = await import('../../helpers/ShopifyObjectHelper.js');

describe('ShopifyObjectHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrderList', () => {
    it('should transform order list and filter out orders with order_id metafield', () => {
      const orderList = [
        {
          name: 'ORDER001',
          id: 'gid://shopify/Order/123',
          createdAt: '2024-01-01T00:00:00Z',
          totalDiscounts: '100.00',
          netPayment: '900.00',
          cancelReason: null,
          tags: ['tag1'],
          customer: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '1234567890',
            id: 'gid://shopify/Customer/456',
            displayName: 'John Doe',
            emailMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
            smsMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
          },
          shippingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            name: 'John Doe',
            address1: '123 Main St',
            city: 'Istanbul',
            address2: 'Kadikoy',
          },
          lineItems: {
            nodes: [
              {
                sku: 'SKU001',
                variant: {
                  barcode: 'BAR001',
                },
                refundableQuantity: 2,
                nonFulfillableQuantity: 0,
                totalDiscount: '10.00',
                originalUnitPrice: '100.00',
              },
            ],
          },
          fulfillmentOrders: {
            nodes: [
              {
                id: 'gid://shopify/FulfillmentOrder/789',
                lineItems: {
                  nodes: [
                    {
                      id: 'gid://shopify/FulfillmentOrderLineItem/101',
                      lineItem: {
                        variant: {
                          barcode: 'BAR001',
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
          metafields: {
            edges: [],
          },
        },
      ];

      const result = ShopifyObjectHelper.getOrderList(orderList);

      expect(result).toHaveLength(1);
      expect(result[0].order_id).toBe('ORDER001.gid://shopify/Order/123');
      expect(result[0].is_cancelled).toBe(false);
      expect(result[0].customer.first_name).toBe('John');
      expect(result[0].lines).toHaveLength(1);
      expect(result[0].lines[0].barcode).toBe('BAR001');
    });

    it('should filter out orders with order_id metafield', () => {
      const orderList = [
        {
          name: 'ORDER001',
          id: 'gid://shopify/Order/123',
          createdAt: '2024-01-01T00:00:00Z',
          totalDiscounts: '0.00',
          netPayment: '100.00',
          cancelReason: null,
          tags: [],
          customer: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '1234567890',
            id: 'gid://shopify/Customer/456',
            displayName: 'John Doe',
            emailMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
            smsMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
          },
          shippingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            name: 'John Doe',
            address1: '123 Main St',
            city: 'Istanbul',
            address2: 'Kadikoy',
          },
          lineItems: {
            nodes: [],
          },
          fulfillmentOrders: {
            nodes: [],
          },
          metafields: {
            edges: [
              {
                node: {
                  namespace: 'gonextso_nebim_app',
                  key: 'order_id',
                  value: 'NEBIM001',
                },
              },
            ],
          },
        },
      ];

      const result = ShopifyObjectHelper.getOrderList(orderList);

      expect(result).toHaveLength(0);
    });

    it('should handle cancelled orders', () => {
      const orderList = [
        {
          name: 'ORDER001',
          id: 'gid://shopify/Order/123',
          createdAt: '2024-01-01T00:00:00Z',
          totalDiscounts: '0.00',
          netPayment: '100.00',
          cancelReason: 'Customer cancelled',
          tags: [],
          customer: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '1234567890',
            id: 'gid://shopify/Customer/456',
            displayName: 'John Doe',
            emailMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
            smsMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
          },
          shippingAddress: {
            firstName: 'John',
            lastName: 'Doe',
            name: 'John Doe',
            address1: '123 Main St',
            city: 'Istanbul',
            address2: 'Kadikoy',
          },
          lineItems: {
            nodes: [],
          },
          fulfillmentOrders: {
            nodes: [],
          },
          metafields: {
            edges: [],
          },
        },
      ];

      const result = ShopifyObjectHelper.getOrderList(orderList);

      expect(result[0].is_cancelled).toBe(true);
    });

    it('should handle receiver not customer scenario', () => {
      const orderList = [
        {
          name: 'ORDER001',
          id: 'gid://shopify/Order/123',
          createdAt: '2024-01-01T00:00:00Z',
          totalDiscounts: '0.00',
          netPayment: '100.00',
          cancelReason: null,
          tags: [],
          customer: {
            firstName: 'John',
            lastName: 'Doe',
            displayName: 'John Doe',
            emailMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
            smsMarketingConsent: {
              consentUpdatedAt: '2024-01-01',
              marketingState: 'SUBSCRIBED',
            },
          },
          shippingAddress: {
            firstName: 'Jane',
            lastName: 'Smith',
            name: 'Jane Smith',
            address1: '123 Main St',
            city: 'Istanbul',
            address2: 'Kadikoy',
          },
          lineItems: {
            nodes: [],
          },
          fulfillmentOrders: {
            nodes: [],
          },
          metafields: {
            edges: [],
          },
        },
      ];

      const result = ShopifyObjectHelper.getOrderList(orderList);

      expect(result[0].is_receiver_not_customer).toBe(true);
    });

    it('should handle null order list', () => {
      const result = ShopifyObjectHelper.getOrderList(null);

      expect(result).toEqual([]);
    });

    it('should handle empty order list', () => {
      const result = ShopifyObjectHelper.getOrderList([]);

      expect(result).toEqual([]);
    });
  });

  describe('getGid', () => {
    it('should generate GID for given id and type', () => {
      const result = ShopifyObjectHelper.getGid('123', 'Order');

      expect(result).toBe('gid://shopify/Order/123');
    });

    it('should handle different types', () => {
      expect(ShopifyObjectHelper.getGid('456', 'Product')).toBe('gid://shopify/Product/456');
      expect(ShopifyObjectHelper.getGid('789', 'Customer')).toBe('gid://shopify/Customer/789');
    });
  });
});

