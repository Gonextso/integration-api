import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockApi = {
  query: jest.fn(),
};

const mockShopifyObjectHelper = {
  getOrderList: jest.fn(),
};

const mockSuccessOrder = {
  findOne: jest.fn(),
};

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    error: jest.fn(),
  },
  throws: jest.fn((message) => {
    throw new Error(message);
  }),
}));

await jest.unstable_mockModule('../../../apis/ShopifyGqlAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockApi),
}));

await jest.unstable_mockModule('../../../helpers/ShopifyObjectHelper.js', () => ({
  default: mockShopifyObjectHelper,
}));

await jest.unstable_mockModule('../../../models/db/SuccessOrder.js', () => ({
  default: mockSuccessOrder,
}));

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: ShopifyOrderBusiness } = await import('../../../business/shopify/OrderBusiness.js');

describe('ShopifyOrderBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      shopify: {
        name: 'test-shop',
      },
    };

    jest.clearAllMocks();
    business = new ShopifyOrderBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrders', () => {
    it('should fetch orders successfully with pagination', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      const mockOrders = [
        { id: 'order1', name: '#1001' },
        { id: 'order2', name: '#1002' },
      ];
      const mockFormattedOrders = [
        { order_id: 'order1', name: '#1001' },
        { order_id: 'order2', name: '#1002' },
      ];

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            orders: {
              edges: [
                { node: { id: 'order1', name: '#1001' }, cursor: 'cursor1' },
                { node: { id: 'order2', name: '#1002' }, cursor: 'cursor2' },
              ],
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        });

      mockShopifyObjectHelper.getOrderList.mockReturnValue(mockFormattedOrders);

      const result = await business.getOrders(startDate, endDate);

      expect(mockApi.query).toHaveBeenCalled();
      expect(mockShopifyObjectHelper.getOrderList).toHaveBeenCalledWith(mockOrders);
      expect(result).toEqual(mockFormattedOrders);
    });

    it('should handle pagination when hasNextPage is true', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            orders: {
              edges: [
                { node: { id: 'order1' }, cursor: 'cursor1' },
              ],
              pageInfo: {
                hasNextPage: true,
              },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            orders: {
              edges: [
                { node: { id: 'order2' }, cursor: 'cursor2' },
              ],
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        });

      mockShopifyObjectHelper.getOrderList.mockReturnValue([]);

      await business.getOrders(startDate, endDate);

      expect(mockApi.query).toHaveBeenCalledTimes(2);
    });

    it('should return undefined when GraphQL errors occur', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      mockApi.query.mockResolvedValue({
        errors: [{ message: 'GraphQL Error' }],
      });

      const result = await business.getOrders(startDate, endDate);

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('getOrdersByIds', () => {
    it('should fetch orders by IDs successfully', async () => {
      const orderIds = ['1001', '1002'];
      const mockFormattedOrders = [
        { order_id: 'order1', name: '#1001' },
      ];

      mockApi.query.mockResolvedValue({
        data: {
          nodes: [
            { id: 'gid://shopify/Order/1001', name: '#1001' },
            { id: 'gid://shopify/Order/1002', name: '#1002' },
          ],
        },
      });

      mockShopifyObjectHelper.getOrderList.mockReturnValue(mockFormattedOrders);

      const result = await business.getOrdersByIds(orderIds);

      expect(mockApi.query).toHaveBeenCalled();
      expect(result).toEqual(mockFormattedOrders);
    });

    it('should normalize order IDs to GID format', async () => {
      const orderIds = ['1001', 'gid://shopify/Order/1002'];

      mockApi.query.mockResolvedValue({
        data: {
          nodes: [],
        },
      });

      mockShopifyObjectHelper.getOrderList.mockReturnValue([]);

      await business.getOrdersByIds(orderIds);

      const callArgs = mockApi.query.mock.calls[0][1];
      expect(callArgs.ids[0]).toBe('gid://shopify/Order/1001');
      expect(callArgs.ids[1]).toBe('gid://shopify/Order/1002');
    });

    it('should handle chunks larger than 250 IDs', async () => {
      const orderIds = Array.from({ length: 500 }, (_, i) => `order${i}`);

      mockApi.query.mockResolvedValue({
        data: {
          nodes: [],
        },
      });

      mockShopifyObjectHelper.getOrderList.mockReturnValue([]);

      await business.getOrdersByIds(orderIds);

      expect(mockApi.query).toHaveBeenCalledTimes(2); // 500 / 250 = 2 chunks
    });

    it('should return empty array when orderIds is empty', async () => {
      const result = await business.getOrdersByIds([]);

      expect(result).toEqual([]);
      expect(mockApi.query).not.toHaveBeenCalled();
    });

    it('should return empty array when orderIds is not an array', async () => {
      const result = await business.getOrdersByIds(null);

      expect(result).toEqual([]);
      expect(mockApi.query).not.toHaveBeenCalled();
    });

    it('should handle GraphQL errors gracefully', async () => {
      const orderIds = ['1001'];

      mockApi.query.mockResolvedValue({
        errors: [{ message: 'GraphQL Error' }],
      });

      mockShopifyObjectHelper.getOrderList.mockReturnValue([]);

      const result = await business.getOrdersByIds(orderIds);

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('sendErpIdToMetadata', () => {
    it('should send ERP ID to metadata successfully', async () => {
      const orderId = '1001';
      const erpId = 'NEBIM001';

      mockApi.query.mockResolvedValue({
        data: {
          orderUpdate: {
            order: { id: 'gid://shopify/Order/1001' },
            userErrors: [],
          },
        },
      });

      const result = await business.sendErpIdToMetadata(orderId, erpId);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe(orderId);
      expect(result.erpId).toBe(erpId);
      expect(business.logger.info2).toHaveBeenCalled();
    });

    it('should normalize order ID to GID format', async () => {
      const orderId = '1001';
      const erpId = 'NEBIM001';

      mockApi.query.mockResolvedValue({
        data: {
          orderUpdate: {
            order: { id: 'gid://shopify/Order/1001' },
            userErrors: [],
          },
        },
      });

      await business.sendErpIdToMetadata(orderId, erpId);

      const callArgs = mockApi.query.mock.calls[0][1];
      expect(callArgs.input.id).toBe('gid://shopify/Order/1001');
    });

    it('should throw error when GraphQL errors occur', async () => {
      const orderId = '1001';
      const erpId = 'NEBIM001';

      mockApi.query.mockResolvedValue({
        errors: [{ message: 'GraphQL Error' }],
      });

      await expect(business.sendErpIdToMetadata(orderId, erpId)).rejects.toThrow();
    });

    it('should throw error when user errors occur', async () => {
      const orderId = '1001';
      const erpId = 'NEBIM001';

      mockApi.query.mockResolvedValue({
        data: {
          orderUpdate: {
            userErrors: [{ message: 'User Error' }],
          },
        },
      });

      await expect(business.sendErpIdToMetadata(orderId, erpId)).rejects.toThrow();
    });
  });

  describe('sendErpIdsToMetadataBatch', () => {
    it('should send multiple ERP IDs to metadata', async () => {
      const orderErpMappings = [
        { orderId: '1001', erpId: 'NEBIM001' },
        { orderId: '1002', erpId: 'NEBIM002' },
      ];

      mockApi.query.mockResolvedValue({
        data: {
          orderUpdate: {
            order: { id: 'gid://shopify/Order/1001' },
            userErrors: [],
          },
        },
      });

      const result = await business.sendErpIdsToMetadataBatch(orderErpMappings);

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(true);
    });

    it('should handle errors for individual orders', async () => {
      const orderErpMappings = [
        { orderId: '1001', erpId: 'NEBIM001' },
        { orderId: '1002', erpId: 'NEBIM002' },
      ];

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            orderUpdate: {
              order: { id: 'gid://shopify/Order/1001' },
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          errors: [{ message: 'Error' }],
        });

      const result = await business.sendErpIdsToMetadataBatch(orderErpMappings);

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
      expect(result[1].error).toBeDefined();
    });

    it('should return empty array when mappings is empty', async () => {
      const result = await business.sendErpIdsToMetadataBatch([]);

      expect(result).toEqual([]);
    });
  });

  describe('updateErpMetadataForOrders', () => {
    it('should update ERP metadata for orders', async () => {
      const orderMappings = [
        { ecommerceId: '1001', erpId: 'NEBIM001' },
        { ecommerceId: '1002', erpId: 'NEBIM002' },
      ];

      mockApi.query.mockResolvedValue({
        data: {
          orderUpdate: {
            order: { id: 'gid://shopify/Order/1001' },
            userErrors: [],
          },
        },
      });

      const result = await business.updateErpMetadataForOrders(orderMappings);

      expect(result).toHaveLength(2);
    });

    it('should return empty array when mappings is empty', async () => {
      const result = await business.updateErpMetadataForOrders([]);

      expect(result).toEqual([]);
    });
  });
});

