import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../../enums/SystemCodes.js';
import CacheFields from '../../../enums/CacheFields.js';

// Mock dependencies before imports
const mockApi = {
  runProc: jest.fn(),
  post: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockNebimCache = jest.fn().mockImplementation(() => mockCache);

const mockCustomerBusiness = {
  syncCustomerFromOrder: jest.fn(),
};

const mockNebimCustomerBusiness = jest.fn().mockImplementation(() => mockCustomerBusiness);

const mockNebimObjectHelper = {
  toNebimOrder: jest.fn(),
  toNebimCancelOrder: jest.fn(),
  getOrderStatusList: jest.fn(),
};

const mockSystemHelper = {
  createTransaction: jest.fn(),
};

const mockLimitBusiness = {
  checkLimitAvailability: jest.fn(),
};

const mockLimitBusinessClass = jest.fn().mockImplementation(() => mockLimitBusiness);

const mockFailedOrder = {
  findOne: jest.fn(),
};

const mockSuccessOrder = {
  findOne: jest.fn(),
};

const mockTenantModel = {
  findById: jest.fn(),
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

await jest.unstable_mockModule('../../../apis/NebimV3IntegratorAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockApi),
}));

await jest.unstable_mockModule('../../../cache/NebimCache.js', () => ({
  default: mockNebimCache,
}));

await jest.unstable_mockModule('../../../business/nebim/CustomerBusiness.js', () => ({
  default: mockNebimCustomerBusiness,
}));

await jest.unstable_mockModule('../../../helpers/NebimObjectHelper.js', () => ({
  default: mockNebimObjectHelper,
}));

await jest.unstable_mockModule('../../../helpers/SystemHelper.js', () => ({
  default: mockSystemHelper,
}));

await jest.unstable_mockModule('../../../business/LimitBusiness.js', () => ({
  default: mockLimitBusinessClass,
}));

await jest.unstable_mockModule('../../../models/db/postgres/FailedOrder.js', () => ({
  default: mockFailedOrder,
}));

await jest.unstable_mockModule('../../../models/db/postgres/SuccessOrder.js', () => ({
  default: mockSuccessOrder,
}));

await jest.unstable_mockModule('../../../models/db/postgres/Tenant.js', () => ({
  default: mockTenantModel,
}));

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: NebimOrderBusiness } = await import('../../../business/nebim/OrderBusiness.js');

describe('NebimOrderBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'Test Tenant',
      nebim: {
        procNames: {
          defaults: {
            addressCodes: 'GetAddressCodes',
          },
          order: {
            status: 'GetOrderStatus',
          },
        },
      },
      shopify: {
        billing: {
          planKey: SystemCodes.BILLING_PLANS.BASIC.KEY,
          limits: {
            order: {
              limit: 100,
              used: 0,
            },
          },
        },
      },
    };

    jest.clearAllMocks();
    business = new NebimOrderBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
    business.cache = mockCache;
    business.customerBusiness = mockCustomerBusiness;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheDefaults', () => {
    it('should cache address codes when not cached', async () => {
      const mockAddressCodes = [
        { CityCode: '3401', CityDescription: 'Istanbul' },
      ];

      mockCache.get.mockResolvedValue(null);
      mockApi.runProc.mockResolvedValue(mockAddressCodes);

      await business.cacheDefaults();

      expect(mockCache.get).toHaveBeenCalledWith(CacheFields.NEBIM.ADDRESS_CODES);
      expect(mockApi.runProc).toHaveBeenCalledWith('GetAddressCodes');
      expect(mockCache.set).toHaveBeenCalledWith(
        CacheFields.NEBIM.ADDRESS_CODES,
        mockAddressCodes
      );
    });

    it('should not cache when already cached', async () => {
      const mockAddressCodes = [
        { CityCode: '3401', CityDescription: 'Istanbul' },
      ];

      mockCache.get.mockResolvedValue(mockAddressCodes);

      await business.cacheDefaults();

      expect(mockCache.get).toHaveBeenCalledWith(CacheFields.NEBIM.ADDRESS_CODES);
      expect(mockApi.runProc).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should delete cache when force is true but not refresh if cache still exists', async () => {
      const mockAddressCodes = [
        { CityCode: '3401', CityDescription: 'Istanbul' },
      ];

      mockCache.get.mockResolvedValue(mockAddressCodes);

      await business.cacheDefaults(true);

      expect(mockCache.delete).toHaveBeenCalledWith(CacheFields.NEBIM.ADDRESS_CODES);
      // Note: The current implementation doesn't refresh after delete because
      // allAddressCodes still holds the old value. This might be a bug in the code.
      expect(mockApi.runProc).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('createOrders', () => {
    it('should create orders successfully for BASIC plan', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [
            { barcode: 'BAR001', quantity: 1, remaining_quantity: 0 },
          ],
        },
      ];

      const mockCustomer = {
        CustomerCode: 'CUST001',
        ShippingPostalAddressID: 'ADDR001',
      };

      const mockOrderResponse = {
        OrderNumber: 'ORD001',
        Lines: [
          {
            LineID: 'LINE001',
            Qty1: 1,
            UsedBarcode: 'BAR001',
            LineAmount: 100,
          },
        ],
      };

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockCustomerBusiness.syncCustomerFromOrder.mockResolvedValue(mockCustomer);
      mockNebimObjectHelper.toNebimOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockResolvedValue(mockOrderResponse);
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => {
        return await work();
      });

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(1);
      expect(result.failedOrders).toHaveLength(0);
      expect(result.skippedFailedOrderCount).toBe(0);
      expect(result.skippedAlreadySyncedOrders).toBe(0);
    });

    it('should grow the limit check amount with in-batch successes', async () => {
      const buildOrder = orderId => ({
        order_id: orderId,
        is_cancelled: false,
        platform: 'SHOPIFY',
        lines: [{ barcode: 'BAR001', quantity: 1, remaining_quantity: 0 }],
      });
      const orderList = [buildOrder('ORD001'), buildOrder('ORD002')];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockCustomerBusiness.syncCustomerFromOrder.mockResolvedValue({ CustomerCode: 'CUST001' });
      mockNebimObjectHelper.toNebimOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockResolvedValue({
        OrderNumber: 'NEBIM001',
        Lines: [{ LineID: 'LINE001', Qty1: 1, UsedBarcode: 'BAR001', LineAmount: 100 }],
      });
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => work());

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(2);
      // SuccessOrder rows are persisted after the batch, so the second check
      // must account for the first in-batch success.
      expect(mockLimitBusiness.checkLimitAvailability).toHaveBeenNthCalledWith(1, SystemCodes.LIMIT_TYPE.ORDER, 1);
      expect(mockLimitBusiness.checkLimitAvailability).toHaveBeenNthCalledWith(2, SystemCodes.LIMIT_TYPE.ORDER, 2);
    });

    it('should return TOKEN_CHECK failed order when limit is exceeded', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [{ barcode: 'BAR001', quantity: 1, remaining_quantity: 0 }],
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockLimitBusiness.checkLimitAvailability.mockRejectedValue(new Error('Limit exceed'));
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => work());

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(0);
      expect(result.failedOrders).toHaveLength(1);
      expect(result.failedOrders[0]).toMatchObject({
        ok: false,
        reason: 'Limit exceed',
        ecommerceId: 'ORD001',
        process: SystemCodes.PROCESS.TOKEN_CHECK,
      });
      expect(mockCustomerBusiness.syncCustomerFromOrder).not.toHaveBeenCalled();
    });

    it('should not check or charge limits for ENTERPRISE plan', async () => {
      mockTenant.shopify.billing.planKey = SystemCodes.BILLING_PLANS.ENTERPRISE.KEY;

      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [{ barcode: 'BAR001', quantity: 1, remaining_quantity: 0 }],
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockCustomerBusiness.syncCustomerFromOrder.mockResolvedValue({ CustomerCode: 'CUST001' });
      mockNebimObjectHelper.toNebimOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockResolvedValue({
        OrderNumber: 'NEBIM001',
        Lines: [{ LineID: 'LINE001', Qty1: 1, UsedBarcode: 'BAR001', LineAmount: 100 }],
      });
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => work());

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(1);
      expect(mockLimitBusiness.checkLimitAvailability).not.toHaveBeenCalled();
    });

    it('should skip already synced orders', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [],
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue({
        ecommerceId: 'ORD001',
        isCancelled: false,
      });

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(0);
      expect(result.skippedAlreadySyncedOrders).toBe(1);
    });

    it('should skip failed orders when dontSkipFailedOrders is false', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [],
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue({
        ecommerceId: 'ORD001',
        isCancelled: false,
      });
      mockSuccessOrder.findOne.mockResolvedValue(null);

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(0);
      expect(result.skippedFailedOrderCount).toBe(1);
    });

    it('should not skip failed orders when dontSkipFailedOrders is true', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [],
        },
      ];

      const mockCustomer = {
        CustomerCode: 'CUST001',
        ShippingPostalAddressID: 'ADDR001',
      };

      const mockOrderResponse = {
        OrderNumber: 'ORD001',
        Lines: [],
      };

      mockFailedOrder.findOne.mockResolvedValue({
        ecommerceId: 'ORD001',
        isCancelled: false,
      });
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockCustomerBusiness.syncCustomerFromOrder.mockResolvedValue(mockCustomer);
      mockNebimObjectHelper.toNebimOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockResolvedValue(mockOrderResponse);
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => {
        return await work();
      });

      const result = await business.createOrders(orderList, true);

      expect(result.skippedFailedOrderCount).toBe(0);
    });

    it('should handle customer sync errors', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [],
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockCustomerBusiness.syncCustomerFromOrder.mockRejectedValue(
        new Error('Customer sync failed')
      );
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => {
        return await work();
      });

      const result = await business.createOrders(orderList);

      expect(result.failedOrders).toHaveLength(1);
      expect(result.failedOrders[0].ok).toBe(false);
      expect(result.failedOrders[0].process).toBe(SystemCodes.PROCESS.SYNC_CUSTOMER);
    });

    it('should handle order creation errors', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [],
        },
      ];

      const mockCustomer = {
        CustomerCode: 'CUST001',
        ShippingPostalAddressID: 'ADDR001',
      };

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockCustomerBusiness.syncCustomerFromOrder.mockResolvedValue(mockCustomer);
      mockNebimObjectHelper.toNebimOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockRejectedValue(new Error('Order creation failed'));
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => {
        return await work();
      });

      const result = await business.createOrders(orderList);

      expect(result.failedOrders).toHaveLength(1);
      expect(result.failedOrders[0].ok).toBe(false);
      expect(result.failedOrders[0].process).toBe(SystemCodes.PROCESS.SYNC_ORDERS);
    });

    it('should filter out cancelled orders', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: true,
          platform: 'SHOPIFY',
          lines: [],
        },
        {
          order_id: 'ORD002',
          is_cancelled: false,
          platform: 'SHOPIFY',
          lines: [],
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockCustomerBusiness.syncCustomerFromOrder.mockResolvedValue({
        CustomerCode: 'CUST001',
        ShippingPostalAddressID: 'ADDR001',
      });
      mockNebimObjectHelper.toNebimOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockResolvedValue({
        OrderNumber: 'ORD002',
        Lines: [],
      });
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => {
        return await work();
      });

      const result = await business.createOrders(orderList);

      expect(result.successOrders).toHaveLength(1);
      expect(result.successOrders[0].ecommerceId).toBe('ORD002');
    });
  });

  describe('cancelOrders', () => {
    it('should cancel orders successfully', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: true,
          platform: 'SHOPIFY',
        },
      ];

      const mockCreatedOrder = {
        ecommerceId: 'ORD001',
        erpId: 'NEBIM001',
        isCancelled: false,
      };

      const mockCancelResponse = {
        OrderNumber: 'NEBIM001',
      };

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(mockCreatedOrder);
      mockNebimObjectHelper.toNebimCancelOrder.mockReturnValue({ ModelType: 1 });
      mockApi.post.mockResolvedValue(mockCancelResponse);
      mockSystemHelper.createTransaction.mockImplementation(async (tenant, id, work) => {
        return await work();
      });

      const result = await business.cancelOrders(orderList);

      expect(result.successOrders).toHaveLength(1);
      expect(result.successOrders[0].isCancelled).toBe(true);
      expect(result.failedOrders).toHaveLength(0);
    });

    it('should skip orders that are not synced', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: true,
          platform: 'SHOPIFY',
        },
      ];

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(null);

      const result = await business.cancelOrders(orderList);

      expect(result.successOrders).toHaveLength(0);
      expect(result.skippedNotSyncedCancelOrders).toBe(1);
    });

    it('should skip already cancelled orders', async () => {
      const orderList = [
        {
          order_id: 'ORD001',
          is_cancelled: true,
          platform: 'SHOPIFY',
        },
      ];

      const mockCreatedOrder = {
        ecommerceId: 'ORD001',
        isCancelled: true,
      };

      mockFailedOrder.findOne.mockResolvedValue(null);
      mockSuccessOrder.findOne.mockResolvedValue(mockCreatedOrder);

      const result = await business.cancelOrders(orderList);

      expect(result.successOrders).toHaveLength(0);
      expect(result.skippedAlreadySyncedOrders).toBe(1);
    });
  });

  describe('getOrderStatus', () => {
    it('should get order status list', async () => {
      const startDate = '2024-01-01';
      const mockStatusData = [
        { OrderNumber: 'ORD001', Status: 'SHIPPED' },
      ];
      const mockFormattedStatus = [
        { orderNumber: 'ORD001', status: 'SHIPPED' },
      ];

      mockApi.runProc.mockResolvedValue(mockStatusData);
      mockNebimObjectHelper.getOrderStatusList.mockReturnValue(mockFormattedStatus);

      const result = await business.getOrderStatus(startDate);

      expect(mockApi.runProc).toHaveBeenCalledWith(
        'GetOrderStatus',
        { Date: startDate }
      );
      expect(mockNebimObjectHelper.getOrderStatusList).toHaveBeenCalledWith(mockStatusData);
      expect(result).toEqual(mockFormattedStatus);
    });
  });
});

