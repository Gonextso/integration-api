import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';
import SystemCodes from '../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockOrderBusiness = {
  syncShopifyToNebim: jest.fn(),
  getSyncFailedOrders: jest.fn(),
  syncFailedOrders: jest.fn(),
  syncOrderStatus: jest.fn(),
};

const mockOrderBusinessClass = jest.fn().mockImplementation(() => mockOrderBusiness);

const mockCoreController = {
  response: jest.fn(),
};

await jest.unstable_mockModule('../../business/OrderBusiness.js', () => ({
  default: mockOrderBusinessClass,
}));

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: jest.fn().mockImplementation(() => mockCoreController),
}));

const { default: ShopifyNebimOrderController } = await import('../../controllers/ShopifyNebimOrderController.js');

describe('ShopifyNebimOrderController', () => {
  let mockReq;
  let mockRes;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    mockReq = {
      tenant: mockTenant,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      body: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
    mockCoreController.response.mockReturnValue(mockRes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sync', () => {
    it('should sync orders and return accepted status', async () => {
      mockOrderBusiness.syncShopifyToNebim.mockResolvedValue(undefined);

      await ShopifyNebimOrderController.sync(mockReq, mockRes);

      expect(mockOrderBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockOrderBusiness.syncShopifyToNebim).toHaveBeenCalledWith(
        mockReq.startDate,
        mockReq.endDate
      );
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.ACCEPTED,
      });
    });
  });

  describe('getSyncFailedOrders', () => {
    it('should get failed orders and return success', async () => {
      const failedOrders = [
        {
          ecommerceId: 'order1',
          reason: 'Error',
        },
      ];

      mockOrderBusiness.getSyncFailedOrders.mockResolvedValue(failedOrders);

      await ShopifyNebimOrderController.getSyncFailedOrders(mockReq, mockRes);

      expect(mockOrderBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockOrderBusiness.getSyncFailedOrders).toHaveBeenCalledWith(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY
      );
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.SUCCESS,
        content: failedOrders,
      });
    });
  });

  describe('syncFailedOrders', () => {
    it('should sync failed orders and return accepted status', async () => {
      const orderNumberList = ['order1', 'order2'];
      mockReq.body = { orderNumberList };

      mockOrderBusiness.syncFailedOrders.mockResolvedValue(undefined);

      await ShopifyNebimOrderController.syncFailedOrders(mockReq, mockRes);

      expect(mockOrderBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockOrderBusiness.syncFailedOrders).toHaveBeenCalledWith(
        SystemCodes.ERP.V3_INTEGRATOR,
        SystemCodes.ECOMMERCE.SHOPIFY,
        orderNumberList
      );
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.ACCEPTED,
      });
    });

    it('should return error when orderNumberList is missing', async () => {
      mockReq.body = {};

      await ShopifyNebimOrderController.syncFailedOrders(mockReq, mockRes);

      expect(mockOrderBusiness.syncFailedOrders).not.toHaveBeenCalled();
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'orderNumberList is required',
      });
    });
  });

  describe('syncOrderStatus', () => {
    it('should sync order status and return accepted status', async () => {
      mockOrderBusiness.syncOrderStatus.mockResolvedValue(undefined);

      await ShopifyNebimOrderController.syncOrderStatus(mockReq, mockRes);

      expect(mockOrderBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockOrderBusiness.syncOrderStatus).toHaveBeenCalledWith(
        mockReq.startDate,
        mockReq.endDate
      );
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.ACCEPTED,
      });
    });
  });
});

