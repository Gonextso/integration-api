import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockShopifyOrderBusiness = {
  getOrders: jest.fn(),
  getOrdersByIds: jest.fn(),
  updateErpMetadataForOrders: jest.fn(),
  updateOrderFullfillmentStatus: jest.fn(),
};

const mockNebimOrderBusiness = {
  cacheDefaults: jest.fn(),
  createOrders: jest.fn(),
  cancelOrders: jest.fn(),
  getOrderStatus: jest.fn(),
};

const mockShopifyOrderBusinessClass = jest.fn().mockImplementation(() => mockShopifyOrderBusiness);
const mockNebimOrderBusinessClass = jest.fn().mockImplementation(() => mockNebimOrderBusiness);

const mockOrderSyncBatch = {
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockSyncBatchLog = {
  create: jest.fn(),
};

const mockFailedOrder = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
};

const mockSuccessOrder = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockRequestLog = {
  find: jest.fn(),
};

const mockLimitBusiness = {
  syncUsageSnapshot: jest.fn(),
};

const mockLimitBusinessClass = jest.fn().mockImplementation(() => mockLimitBusiness);

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  traceId: 'test-trace-id',
}));

await jest.unstable_mockModule('../../business/shopify/OrderBusiness.js', () => ({
  default: mockShopifyOrderBusinessClass,
}));

await jest.unstable_mockModule('../../business/nebim/OrderBusiness.js', () => ({
  default: mockNebimOrderBusinessClass,
}));

await jest.unstable_mockModule('../../business/LimitBusiness.js', () => ({
  default: mockLimitBusinessClass,
}));

await jest.unstable_mockModule('../../models/db/postgres/OrderSyncBatch.js', () => ({
  default: mockOrderSyncBatch,
}));

await jest.unstable_mockModule('../../models/db/postgres/SyncBatchLog.js', () => ({
  default: mockSyncBatchLog,
}));

await jest.unstable_mockModule('../../models/db/postgres/FailedOrder.js', () => ({
  default: mockFailedOrder,
}));

await jest.unstable_mockModule('../../models/db/postgres/SuccessOrder.js', () => ({
  default: mockSuccessOrder,
}));

await jest.unstable_mockModule('../../models/db/postgres/RequestLog.js', () => ({
  default: mockRequestLog,
}));

await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: OrderBusiness } = await import('../../business/OrderBusiness.js');

describe('OrderBusiness', () => {
  let business;
  let mockTenant;

  const emptyCancelResults = {
    successOrders: [],
    failedOrders: [],
    skippedFailedOrderCount: 0,
    skippedAlreadySyncedOrders: 0,
    skippedNotSyncedCancelOrders: 0,
  };

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      id: 'test-tenant-id',
      shopify: {
        name: 'test-shop',
      },
    };

    jest.clearAllMocks();
    mockOrderSyncBatch.create.mockResolvedValue({ id: 'batch-id', numbers: {} });
    mockOrderSyncBatch.updateOne.mockResolvedValue({});
    mockSyncBatchLog.create.mockResolvedValue({});
    mockFailedOrder.create.mockResolvedValue({});
    mockFailedOrder.updateOne.mockResolvedValue({});
    mockFailedOrder.deleteOne.mockResolvedValue({});
    mockSuccessOrder.create.mockResolvedValue({});
    mockLimitBusiness.syncUsageSnapshot.mockResolvedValue(0);
    business = new OrderBusiness(mockTenant);
    business.tenant = mockTenant;
    business.traceId = 'test-trace-id';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncShopifyToNebim', () => {
    it('should sync orders successfully', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      const shopifyOrderList = [
        {
          order_id: 'order1',
          is_cancelled: false,
          platform: 'SHOPIFY',
        },
      ];

      const createOrderResults = {
        successOrders: [
          {
            ecommerceId: 'name1.gid://shopify/Order/order1',
            erpId: 'NEBIM001',
            lines: [],
            isCancelled: false,
            isPartiallyCancelled: false,
          },
        ],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(emptyCancelResults);
      mockShopifyOrderBusiness.updateErpMetadataForOrders.mockResolvedValue([]);

      await business.syncShopifyToNebim(startDate, endDate);

      expect(mockShopifyOrderBusiness.getOrders).toHaveBeenCalledWith(startDate, endDate);
      expect(mockNebimOrderBusiness.cacheDefaults).toHaveBeenCalled();
      expect(mockNebimOrderBusiness.createOrders).toHaveBeenCalled();
      expect(mockOrderSyncBatch.create).toHaveBeenCalled();
      expect(mockSuccessOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        tenant: mockTenant.id,
        nebimOrderId: 'NEBIM001',
      }));
      expect(mockShopifyOrderBusiness.updateErpMetadataForOrders).toHaveBeenCalled();
      expect(mockOrderSyncBatch.updateOne).toHaveBeenCalled();
    });

    it('should snapshot order usage once after persisting orders', async () => {
      const shopifyOrderList = [
        { order_id: 'order1', is_cancelled: false, platform: 'SHOPIFY' },
      ];

      const createOrderResults = {
        successOrders: [
          {
            ecommerceId: 'name1.gid://shopify/Order/order1',
            erpId: 'NEBIM001',
            lines: [],
            isCancelled: false,
            isPartiallyCancelled: false,
          },
        ],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(emptyCancelResults);
      mockShopifyOrderBusiness.updateErpMetadataForOrders.mockResolvedValue([]);

      await business.syncShopifyToNebim('2024-01-01', '2024-01-31');

      expect(mockLimitBusiness.syncUsageSnapshot).toHaveBeenCalledTimes(1);
      expect(mockLimitBusiness.syncUsageSnapshot).toHaveBeenCalledWith(SystemCodes.LIMIT_TYPE.ORDER);

      // Snapshot must run after SuccessOrder rows are persisted
      const snapshotOrder = mockLimitBusiness.syncUsageSnapshot.mock.invocationCallOrder[0];
      const successCreateOrder = mockSuccessOrder.create.mock.invocationCallOrder[0];
      expect(snapshotOrder).toBeGreaterThan(successCreateOrder);
    });

    it('should return early when no orders found', async () => {
      mockShopifyOrderBusiness.getOrders.mockResolvedValue([]);

      await business.syncShopifyToNebim('2024-01-01', '2024-01-31');

      expect(mockNebimOrderBusiness.cacheDefaults).not.toHaveBeenCalled();
      expect(mockNebimOrderBusiness.createOrders).not.toHaveBeenCalled();
      expect(mockLimitBusiness.syncUsageSnapshot).not.toHaveBeenCalled();
    });

    it('should handle failed orders', async () => {
      const shopifyOrderList = [
        { order_id: 'order1', is_cancelled: false, platform: 'SHOPIFY' },
      ];

      const createOrderResults = {
        successOrders: [],
        failedOrders: [
          {
            ecommerceId: 'order1',
            reason: 'Error message',
            process: SystemCodes.PROCESS.SYNC_ORDERS,
          },
        ],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(emptyCancelResults);

      await business.syncShopifyToNebim('2024-01-01', '2024-01-31');

      expect(mockFailedOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        shopifyOrderId: 'order1',
        reason: 'Error message',
      }));
      expect(mockSuccessOrder.create).not.toHaveBeenCalled();
    });

    it('should handle cancelled orders', async () => {
      const shopifyOrderList = [
        { order_id: 'order1', is_cancelled: true, platform: 'SHOPIFY' },
      ];

      const createOrderResults = {
        successOrders: [],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      const cancelOrderResults = {
        ...emptyCancelResults,
        successOrders: [
          {
            ecommerceId: 'name1.gid://shopify/Order/order1',
            erpId: 'NEBIM001',
            isCancelled: true,
          },
        ],
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(cancelOrderResults);

      await business.syncShopifyToNebim('2024-01-01', '2024-01-31');

      expect(mockNebimOrderBusiness.cancelOrders).toHaveBeenCalled();
      expect(mockSuccessOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        isCancelled: true,
      }));
    });

    it('should handle errors gracefully', async () => {
      mockShopifyOrderBusiness.getOrders.mockRejectedValue(new Error('API Error'));

      await business.syncShopifyToNebim('2024-01-01', '2024-01-31');

      expect(business.logger.error).toHaveBeenCalled();
      expect(business.logger.info).toHaveBeenCalled();
    });
  });

  describe('getSyncFailedOrders', () => {
    it('should get failed orders with request logs', async () => {
      const erp = SystemCodes.ERP.V3_INTEGRATOR;
      const ecommerce = SystemCodes.ECOMMERCE.SHOPIFY;

      const failedOrders = [
        {
          ecommerceId: 'order1',
          traceId: 'trace1',
          reason: 'Error',
          tenant: mockTenant.id,
        },
      ];

      const requestLog = {
        transactionId: 'sync:ORDER1',
        body: JSON.stringify({ test: 'data' }),
        response: JSON.stringify({ error: 'message' }),
        isError: true,
      };

      mockFailedOrder.find.mockResolvedValue(failedOrders);
      mockRequestLog.find.mockResolvedValue([requestLog]);

      const result = await business.getSyncFailedOrders(erp, ecommerce);

      expect(mockFailedOrder.find).toHaveBeenCalledWith({
        tenant: mockTenant.id,
      });
      expect(mockRequestLog.find).toHaveBeenCalledWith({
        tenant: mockTenant.id,
        traceId: 'trace1',
      });
      expect(result).toHaveLength(1);
      expect(result[0].reasonDetail).toEqual({
        request: expect.stringContaining('test'),
        response: expect.stringContaining('message'),
      });
    });

    it('should return empty array when no failed orders', async () => {
      mockFailedOrder.find.mockResolvedValue([]);

      const result = await business.getSyncFailedOrders(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY
      );

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockFailedOrder.find.mockRejectedValue(new Error('DB Error'));

      const result = await business.getSyncFailedOrders(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY
      );

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('syncFailedOrders', () => {
    it('should sync failed orders successfully', async () => {
      const orderNumberList = ['gid://shopify/Order.order1'];

      const failedOrderList = [
        {
          ecommerceId: 'gid://shopify/Order.order1',
          shopifyOrderId: 'gid://shopify/Order.order1',
          isCancelled: false,
        },
      ];

      const orderList = [
        { order_id: 'order1', is_cancelled: false, platform: 'SHOPIFY' },
      ];

      const createOrderResults = {
        successOrders: [
          {
            ecommerceId: 'gid://shopify/Order.order1',
            erpId: 'NEBIM001',
            lines: [],
            isCancelled: false,
          },
        ],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      mockFailedOrder.find
        .mockResolvedValueOnce(failedOrderList) // create flow
        .mockResolvedValueOnce([]); // cancel flow
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockShopifyOrderBusiness.getOrdersByIds.mockResolvedValue(orderList);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockShopifyOrderBusiness.updateErpMetadataForOrders.mockResolvedValue([]);

      await business.syncFailedOrders(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY,
        orderNumberList
      );

      expect(mockShopifyOrderBusiness.getOrdersByIds).toHaveBeenCalled();
      expect(mockNebimOrderBusiness.createOrders).toHaveBeenCalledWith(orderList, true);
      expect(mockSuccessOrder.create).toHaveBeenCalled();
      expect(mockFailedOrder.deleteOne).toHaveBeenCalled();
      expect(mockLimitBusiness.syncUsageSnapshot).toHaveBeenCalledWith(SystemCodes.LIMIT_TYPE.ORDER);
    });

    it('should handle cancelled failed orders', async () => {
      const orderNumberList = ['gid://shopify/Order.order1'];

      const failedCancelOrderList = [
        {
          ecommerceId: 'gid://shopify/Order.order1',
          shopifyOrderId: 'gid://shopify/Order.order1',
          isCancelled: true,
        },
      ];

      const cancelOrderList = [
        { order_id: 'order1', is_cancelled: true, platform: 'SHOPIFY' },
      ];

      const cancelOrderResults = {
        ...emptyCancelResults,
        successOrders: [
          {
            ecommerceId: 'gid://shopify/Order.order1',
            erpId: 'NEBIM001',
            isCancelled: true,
          },
        ],
      };

      mockFailedOrder.find
        .mockResolvedValueOnce([]) // create flow
        .mockResolvedValueOnce(failedCancelOrderList); // cancel flow
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockShopifyOrderBusiness.getOrdersByIds.mockResolvedValue(cancelOrderList);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(cancelOrderResults);

      await business.syncFailedOrders(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY,
        orderNumberList
      );

      expect(mockNebimOrderBusiness.cancelOrders).toHaveBeenCalledWith(cancelOrderList, true);
      expect(mockSuccessOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        isCancelled: true,
      }));
    });

    it('should handle errors gracefully', async () => {
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockFailedOrder.find.mockRejectedValue(new Error('DB Error'));

      await business.syncFailedOrders(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY,
        ['order1']
      );

      expect(business.logger.error).toHaveBeenCalled();
    });
  });

  describe('syncOrderStatus', () => {
    it('should sync order status successfully', async () => {
      const startDate = '2024-01-01';
      const orderStatusList = [
        {
          orderNumber: 'NEBIM001',
          status: 'SHIPPED',
        },
      ];

      mockNebimOrderBusiness.getOrderStatus.mockResolvedValue(orderStatusList);
      mockShopifyOrderBusiness.updateOrderFullfillmentStatus.mockResolvedValue([
        { orderId: 'order1', success: true },
      ]);

      await business.syncOrderStatus(startDate);

      expect(mockNebimOrderBusiness.getOrderStatus).toHaveBeenCalledWith(startDate);
      expect(mockShopifyOrderBusiness.updateOrderFullfillmentStatus).toHaveBeenCalledWith(orderStatusList);
    });

    it('should handle errors gracefully', async () => {
      mockNebimOrderBusiness.getOrderStatus.mockRejectedValue(new Error('API Error'));

      await business.syncOrderStatus('2024-01-01');

      expect(business.logger.error).toHaveBeenCalled();
    });
  });
});
