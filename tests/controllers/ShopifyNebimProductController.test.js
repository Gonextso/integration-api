import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';

// Mock dependencies before imports
const mockProductBusiness = {
  syncDetailsNebimToShopify: jest.fn(),
  syncInventoryNebimToShopify: jest.fn(),
};

const mockProductBusinessClass = jest.fn().mockImplementation(() => mockProductBusiness);

const mockCoreController = {
  response: jest.fn(),
};

await jest.unstable_mockModule('../../business/ProductBusiness.js', () => ({
  default: mockProductBusinessClass,
}));

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: jest.fn().mockImplementation(() => mockCoreController),
}));

const { default: ShopifyNebimProductController } = await import('../../controllers/ShopifyNebimProductController.js');

describe('ShopifyNebimProductController', () => {
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

  describe('syncDetails', () => {
    it('should sync product details and return accepted status', async () => {
      mockProductBusiness.syncDetailsNebimToShopify.mockResolvedValue(undefined);

      await ShopifyNebimProductController.syncDetails(mockReq, mockRes);

      expect(mockProductBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockProductBusiness.syncDetailsNebimToShopify).toHaveBeenCalledWith(
        mockReq.startDate,
        mockReq.endDate
      );
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.ACCEPTED,
      });
    });
  });

  describe('syncInventory', () => {
    it('should sync inventory and return accepted status', async () => {
      mockProductBusiness.syncInventoryNebimToShopify.mockResolvedValue(undefined);

      await ShopifyNebimProductController.syncInventory(mockReq, mockRes);

      expect(mockProductBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockProductBusiness.syncInventoryNebimToShopify).toHaveBeenCalledWith(
        mockReq.startDate,
        mockReq.endDate
      );
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.ACCEPTED,
      });
    });
  });
});

