import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockNebimProductBusiness = {
  getProductDetailList: jest.fn(),
  fetchInventories: jest.fn(),
};

const mockShopifyProductBusiness = {
  syncProductsDetailBulk: jest.fn(),
};

const mockShopifyInventoryBusiness = {
  syncInventoryBulk: jest.fn(),
};

const mockNebimProductBusinessClass = jest.fn().mockImplementation(() => mockNebimProductBusiness);
const mockShopifyProductBusinessClass = jest.fn().mockImplementation(() => mockShopifyProductBusiness);
const mockShopifyInventoryBusinessClass = jest.fn().mockImplementation(() => mockShopifyInventoryBusiness);

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../business/nebim/ProductBusiness.js', () => ({
  default: mockNebimProductBusinessClass,
}));

await jest.unstable_mockModule('../../business/shopify/ProductBusiness.js', () => ({
  default: mockShopifyProductBusinessClass,
}));

await jest.unstable_mockModule('../../business/shopify/InventoryBusiness.js', () => ({
  default: mockShopifyInventoryBusinessClass,
}));

await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: ProductBusiness } = await import('../../business/ProductBusiness.js');

describe('ProductBusiness', () => {
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
    business = new ProductBusiness(mockTenant);
    business.tenant = mockTenant;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncDetailsNebimToShopify', () => {
    it('should sync product details successfully', async () => {
      const startDate = '2024-01-01';
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          variants: [],
        },
      ];

      mockNebimProductBusiness.getProductDetailList.mockResolvedValue(detailList);
      mockShopifyProductBusiness.syncProductsDetailBulk.mockResolvedValue(undefined);

      await business.syncDetailsNebimToShopify(startDate, null);

      expect(mockNebimProductBusiness.getProductDetailList).toHaveBeenCalledWith(startDate);
      expect(mockShopifyProductBusiness.syncProductsDetailBulk).toHaveBeenCalledWith(detailList, [], { startDate: '2024-01-01' });
      expect(business.logger.info2).toHaveBeenCalledWith(
        `Sync product details started from ${startDate}`
      );
      expect(business.logger.info2).toHaveBeenCalledWith(
        `Sync product details finished from ${startDate}`
      );
    });

    it('should handle empty detail list', async () => {
      const startDate = '2024-01-01';

      mockNebimProductBusiness.getProductDetailList.mockResolvedValue([]);
      mockShopifyProductBusiness.syncProductsDetailBulk.mockResolvedValue(undefined);

      await business.syncDetailsNebimToShopify(startDate, null);

      expect(mockShopifyProductBusiness.syncProductsDetailBulk).toHaveBeenCalledWith([], [], { startDate: '2024-01-01' });
    });

    it('should handle errors gracefully', async () => {
      const startDate = '2024-01-01';
      const error = new Error('API Error');

      mockNebimProductBusiness.getProductDetailList.mockRejectedValue(error);

      await business.syncDetailsNebimToShopify(startDate, null);

      expect(business.logger.error).toHaveBeenCalled();
      expect(business.logger.info2).toHaveBeenCalledWith(
        `Sync product details finished from ${startDate}`
      );
    });

    it('should log start and finish messages', async () => {
      const startDate = '2024-01-01';

      mockNebimProductBusiness.getProductDetailList.mockResolvedValue([]);
      mockShopifyProductBusiness.syncProductsDetailBulk.mockResolvedValue(undefined);

      await business.syncDetailsNebimToShopify(startDate, null);

      expect(business.logger.info2).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncInventoryNebimToShopify', () => {
    it('should sync inventory successfully', async () => {
      const startDate = '2024-01-01';
      const inventories = [
        {
          barcode: 'BAR001',
          quantity: 100,
          warehouse: 'WH001',
        },
      ];

      mockNebimProductBusiness.fetchInventories.mockResolvedValue(inventories);
      mockShopifyInventoryBusiness.syncInventoryBulk.mockResolvedValue(undefined);

      await business.syncInventoryNebimToShopify(startDate, null);

      expect(mockNebimProductBusiness.fetchInventories).toHaveBeenCalledWith(startDate);
      expect(mockShopifyInventoryBusiness.syncInventoryBulk).toHaveBeenCalledWith(inventories);
      expect(business.logger.info2).toHaveBeenCalledWith(
        `Sync inventory started from ${startDate}`
      );
      expect(business.logger.info2).toHaveBeenCalledWith(
        `Sync inventory finished from ${startDate}`
      );
    });

    it('should handle empty inventory list', async () => {
      const startDate = '2024-01-01';

      mockNebimProductBusiness.fetchInventories.mockResolvedValue([]);
      mockShopifyInventoryBusiness.syncInventoryBulk.mockResolvedValue(undefined);

      await business.syncInventoryNebimToShopify(startDate, null);

      expect(mockShopifyInventoryBusiness.syncInventoryBulk).toHaveBeenCalledWith([]);
    });

    it('should handle errors gracefully', async () => {
      const startDate = '2024-01-01';
      const error = new Error('API Error');

      mockNebimProductBusiness.fetchInventories.mockRejectedValue(error);

      await business.syncInventoryNebimToShopify(startDate, null);

      expect(business.logger.error).toHaveBeenCalled();
      expect(business.logger.info2).toHaveBeenCalledWith(
        `Sync inventory finished from ${startDate}`
      );
    });

    it('should log start and finish messages', async () => {
      const startDate = '2024-01-01';

      mockNebimProductBusiness.fetchInventories.mockResolvedValue([]);
      mockShopifyInventoryBusiness.syncInventoryBulk.mockResolvedValue(undefined);

      await business.syncInventoryNebimToShopify(startDate, null);

      expect(business.logger.info2).toHaveBeenCalledTimes(2);
    });
  });
});

