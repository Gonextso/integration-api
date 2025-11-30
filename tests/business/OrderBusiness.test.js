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
  _id: 'batch-id',
  save: jest.fn(),
  numbers: {},
};

const mockOrderSyncBatchModel = jest.fn().mockImplementation((data) => ({
  ...mockOrderSyncBatch,
  ...data,
}));

const mockFailedOrderStatic = {
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockResolvedValue([]),
  }),
  findOneAndUpdate: jest.fn().mockReturnValue({
    exec: jest.fn(),
  }),
  deleteOne: jest.fn().mockReturnValue({
    exec: jest.fn(),
  }),
};

const mockFailedOrderModel = jest.fn().mockImplementation((data) => ({
  ...data,
  save: jest.fn(),
}));

// Add static methods to the model
Object.assign(mockFailedOrderModel, mockFailedOrderStatic);

const mockSuccessOrder = {
  find: jest.fn(),
};

const mockSuccessOrderModel = jest.fn().mockImplementation((data) => ({
  ...data,
  save: jest.fn(),
}));

const mockRequestLog = {
  findOne: jest.fn(),
};

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
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

await jest.unstable_mockModule('../../models/db/OrderSyncBatch.js', () => ({
  default: mockOrderSyncBatchModel,
}));

await jest.unstable_mockModule('../../models/db/FailedOrder.js', () => {
  const model = mockFailedOrderModel;
  Object.assign(model, mockFailedOrderStatic);
  return { default: model };
});

await jest.unstable_mockModule('../../models/db/SuccessOrder.js', () => ({
  default: mockSuccessOrderModel,
}));

await jest.unstable_mockModule('../../models/db/RequestLog.js', () => ({
  default: mockRequestLog,
}));

await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: OrderBusiness } = await import('../../business/OrderBusiness.js');

describe('OrderBusiness', () => {
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
            ecommerceId: 'gid://shopify/Order/order1',
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

      const cancelOrderResults = {
        successOrders: [],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
        skippedNotSyncedCancelOrders: 0,
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(cancelOrderResults);
      mockShopifyOrderBusiness.updateErpMetadataForOrders.mockResolvedValue([]);
      mockOrderSyncBatch.save.mockResolvedValue(mockOrderSyncBatch);

      await business.syncShopifyToNebim(startDate, endDate);

      expect(mockShopifyOrderBusiness.getOrders).toHaveBeenCalledWith(startDate, endDate);
      expect(mockNebimOrderBusiness.cacheDefaults).toHaveBeenCalled();
      expect(mockNebimOrderBusiness.createOrders).toHaveBeenCalled();
      expect(mockShopifyOrderBusiness.updateErpMetadataForOrders).toHaveBeenCalled();
      expect(mockOrderSyncBatch.save).toHaveBeenCalled();
    });

    it('should return early when no orders found', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      mockShopifyOrderBusiness.getOrders.mockResolvedValue([]);

      await business.syncShopifyToNebim(startDate, endDate);

      expect(mockNebimOrderBusiness.cacheDefaults).not.toHaveBeenCalled();
      expect(mockNebimOrderBusiness.createOrders).not.toHaveBeenCalled();
    });

    it('should handle failed orders', async () => {
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

      const cancelOrderResults = {
        successOrders: [],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
        skippedNotSyncedCancelOrders: 0,
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(cancelOrderResults);
      mockOrderSyncBatch.save.mockResolvedValue(mockOrderSyncBatch);

      const failedOrderSave = jest.fn();
      mockFailedOrderModel.mockImplementation((data) => ({
        ...data,
        save: failedOrderSave,
      }));

      await business.syncShopifyToNebim(startDate, endDate);

      expect(failedOrderSave).toHaveBeenCalled();
    });

    it('should handle cancelled orders', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      const shopifyOrderList = [
        {
          order_id: 'order1',
          is_cancelled: true,
          platform: 'SHOPIFY',
        },
      ];

      const createOrderResults = {
        successOrders: [],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      const cancelOrderResults = {
        successOrders: [
          {
            ecommerceId: 'gid://shopify/Order/order1',
            erpId: 'NEBIM001',
            isCancelled: true,
          },
        ],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
        skippedNotSyncedCancelOrders: 0,
      };

      mockShopifyOrderBusiness.getOrders.mockResolvedValue(shopifyOrderList);
      mockNebimOrderBusiness.cacheDefaults.mockResolvedValue(undefined);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(cancelOrderResults);
      mockOrderSyncBatch.save.mockResolvedValue(mockOrderSyncBatch);

      await business.syncShopifyToNebim(startDate, endDate);

      expect(mockNebimOrderBusiness.cancelOrders).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      mockShopifyOrderBusiness.getOrders.mockRejectedValue(new Error('API Error'));

      await business.syncShopifyToNebim(startDate, endDate);

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
          _doc: {
            ecommerceId: 'order1',
            traceId: 'trace1',
            reason: 'Error',
            erp: SystemCodes.ERP.V3_INTEGRATOR,
            ecommerce: SystemCodes.ECOMMERCE.SHOPIFY,
            tenant: mockTenant._id,
          },
          ecommerceId: 'order1',
          traceId: 'trace1',
          reason: 'Error',
        },
      ];

      const requestLog = {
        body: JSON.stringify({ test: 'data' }),
        response: JSON.stringify({ error: 'message' }),
        isError: true,
      };

      const mockFindChain = {
        sort: jest.fn().mockResolvedValue(failedOrders),
      };
      mockFailedOrderStatic.find.mockReturnValue(mockFindChain);
      
      const mockRequestLogChain = {
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(requestLog),
          }),
        }),
      };
      mockRequestLog.findOne.mockReturnValue(mockRequestLogChain);

      const result = await business.getSyncFailedOrders(erp, ecommerce);

      expect(mockFailedOrderStatic.find).toHaveBeenCalledWith({
        erp,
        ecommerce,
        tenant: mockTenant._id,
      });
      expect(mockFindChain.sort).toHaveBeenCalledWith({ syncDate: -1 });
      expect(result).toHaveLength(1);
      expect(result[0].reasonDetail).toBeDefined();
    });

    it('should return empty array when no failed orders', async () => {
      const erp = SystemCodes.ERP.V3_INTEGRATOR;
      const ecommerce = SystemCodes.ECOMMERCE.SHOPIFY;

      const mockFindChain = {
        sort: jest.fn().mockResolvedValue([]),
      };
      mockFailedOrderStatic.find.mockReturnValue(mockFindChain);

      const result = await business.getSyncFailedOrders(erp, ecommerce);

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const erp = SystemCodes.ERP.V3_INTEGRATOR;
      const ecommerce = SystemCodes.ECOMMERCE.SHOPIFY;

      const mockFindChain = {
        sort: jest.fn().mockRejectedValue(new Error('DB Error')),
      };
      mockFailedOrderStatic.find.mockReturnValue(mockFindChain);

      const result = await business.getSyncFailedOrders(erp, ecommerce);

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('syncFailedOrders', () => {
    it('should sync failed orders successfully', async () => {
      const erp = SystemCodes.ERP.V3_INTEGRATOR;
      const ecommerce = SystemCodes.ECOMMERCE.SHOPIFY;
      const orderNumberList = ['order1', 'order2'];

      const failedOrderList = [
        {
          ecommerceId: 'gid://shopify/Order.order1',
          isCancelled: false,
        },
      ];

      const orderList = [
        {
          order_id: 'order1',
          is_cancelled: false,
          platform: 'SHOPIFY',
        },
      ];

      const createOrderResults = {
        successOrders: [
          {
            ecommerceId: 'gid://shopify/Order/order1',
            erpId: 'NEBIM001',
            lines: [],
            isCancelled: false,
          },
        ],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
      };

      mockFailedOrderStatic.find.mockResolvedValue(failedOrderList);
      mockShopifyOrderBusiness.getOrdersByIds.mockResolvedValue(orderList);
      mockNebimOrderBusiness.createOrders.mockResolvedValue(createOrderResults);
      mockShopifyOrderBusiness.updateErpMetadataForOrders.mockResolvedValue([]);
      mockOrderSyncBatch.save.mockResolvedValue(mockOrderSyncBatch);

      await business.syncFailedOrders(erp, ecommerce, orderNumberList);

      expect(mockFailedOrderStatic.find).toHaveBeenCalled();
      expect(mockShopifyOrderBusiness.getOrdersByIds).toHaveBeenCalled();
      expect(mockNebimOrderBusiness.createOrders).toHaveBeenCalled();
    });

    it('should handle cancelled failed orders', async () => {
      const erp = SystemCodes.ERP.V3_INTEGRATOR;
      const ecommerce = SystemCodes.ECOMMERCE.SHOPIFY;
      const orderNumberList = ['order1'];

      const failedCancelOrderList = [
        {
          ecommerceId: 'gid://shopify/Order.order1',
          isCancelled: true,
        },
      ];

      const cancelOrderList = [
        {
          order_id: 'order1',
          is_cancelled: true,
          platform: 'SHOPIFY',
        },
      ];

      const cancelOrderResults = {
        successOrders: [
          {
            ecommerceId: 'gid://shopify/Order/order1',
            erpId: 'NEBIM001',
            isCancelled: true,
          },
        ],
        failedOrders: [],
        skippedFailedOrderCount: 0,
        skippedAlreadySyncedOrders: 0,
        skippedNotSyncedCancelOrders: 0,
      };

      mockFailedOrderStatic.find
        .mockResolvedValueOnce([]) // For created orders
        .mockResolvedValueOnce(failedCancelOrderList); // For cancelled orders
      mockShopifyOrderBusiness.getOrdersByIds.mockResolvedValue(cancelOrderList);
      mockNebimOrderBusiness.cancelOrders.mockResolvedValue(cancelOrderResults);
      mockOrderSyncBatch.save.mockResolvedValue(mockOrderSyncBatch);

      await business.syncFailedOrders(erp, ecommerce, orderNumberList);

      expect(mockNebimOrderBusiness.cancelOrders).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const erp = SystemCodes.ERP.V3_INTEGRATOR;
      const ecommerce = SystemCodes.ECOMMERCE.SHOPIFY;
      const orderNumberList = ['order1'];

      mockFailedOrderStatic.find.mockRejectedValue(new Error('DB Error'));

      await business.syncFailedOrders(erp, ecommerce, orderNumberList);

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
      mockShopifyOrderBusiness.updateOrderFullfillmentStatus.mockResolvedValue([]);

      await business.syncOrderStatus(startDate);

      expect(mockNebimOrderBusiness.getOrderStatus).toHaveBeenCalledWith(startDate);
      expect(mockShopifyOrderBusiness.updateOrderFullfillmentStatus).toHaveBeenCalledWith(orderStatusList);
    });

    it('should handle errors gracefully', async () => {
      const startDate = '2024-01-01';

      mockNebimOrderBusiness.getOrderStatus.mockRejectedValue(new Error('API Error'));

      await business.syncOrderStatus(startDate);

      expect(business.logger.error).toHaveBeenCalled();
    });
  });
});

