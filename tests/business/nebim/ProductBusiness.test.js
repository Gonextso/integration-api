import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockApi = {
  runProc: jest.fn(),
};

const mockNebimObjectHelper = {
  getDetailList: jest.fn(),
  getInventories: jest.fn(),
};

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../../apis/NebimV3IntegratorAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockApi),
}));

await jest.unstable_mockModule('../../../helpers/NebimObjectHelper.js', () => ({
  default: mockNebimObjectHelper,
}));

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: NebimProductBusiness } = await import('../../../business/nebim/ProductBusiness.js');

describe('NebimProductBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      nebim: {
        procNames: {
          product: {
            details: 'GetProductDetails',
            price: 'GetProductPrices',
            inventory: 'GetProductInventory',
          },
        },
      },
    };

    jest.clearAllMocks();
    business = new NebimProductBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProductDetailList', () => {
    it('should fetch product details and prices and return formatted list', async () => {
      const startDate = '2024-01-01';
      const mockDetails = [
        { ItemCode: 'ITEM001', ItemDescription: 'Product 1', Barcode: 'BAR001' },
        { ItemCode: 'ITEM002', ItemDescription: 'Product 2', Barcode: 'BAR002' },
      ];
      const mockPrices = [
        { Barcode: 'BAR001', Price: 100, SellPrice: 120, CurrencyCode: 'TRY' },
        { Barcode: 'BAR002', Price: 200, SellPrice: 240, CurrencyCode: 'TRY' },
      ];
      const mockFormattedList = [
        { erp_id: 'ITEM001', title: 'Product 1' },
        { erp_id: 'ITEM002', title: 'Product 2' },
      ];

      mockApi.runProc
        .mockResolvedValueOnce(mockDetails)
        .mockResolvedValueOnce(mockPrices);
      mockNebimObjectHelper.getDetailList.mockReturnValue(mockFormattedList);

      const result = await business.getProductDetailList(startDate);

      expect(mockApi.runProc).toHaveBeenCalledTimes(2);
      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        1,
        'GetProductDetails',
        { Date: startDate }
      );
      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        2,
        'GetProductPrices',
        { Date: startDate }
      );
      expect(mockNebimObjectHelper.getDetailList).toHaveBeenCalledWith(
        mockDetails,
        mockPrices,
        mockTenant
      );
      expect(result).toEqual(mockFormattedList);
    });

    it('should handle empty results', async () => {
      const startDate = '2024-01-01';
      const mockDetails = [];
      const mockPrices = [];
      const mockFormattedList = [];

      mockApi.runProc
        .mockResolvedValueOnce(mockDetails)
        .mockResolvedValueOnce(mockPrices);
      mockNebimObjectHelper.getDetailList.mockReturnValue(mockFormattedList);

      const result = await business.getProductDetailList(startDate);

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      const startDate = '2024-01-01';
      const error = new Error('API Error');

      mockApi.runProc.mockRejectedValueOnce(error);

      await expect(business.getProductDetailList(startDate)).rejects.toThrow('API Error');
    });
  });

  describe('fetchInventories', () => {
    it('should fetch inventory and return formatted list', async () => {
      const startDate = '2024-01-01';
      const mockInventory = [
        { Barcode: 'BAR001', Quantity: 100, WarehouseCode: 'WH001' },
        { Barcode: 'BAR002', Quantity: 50, WarehouseCode: 'WH001' },
      ];
      const mockFormattedInventory = [
        { barcode: 'BAR001', quantity: 100, warehouse: 'WH001' },
        { barcode: 'BAR002', quantity: 50, warehouse: 'WH001' },
      ];

      mockApi.runProc.mockResolvedValue(mockInventory);
      mockNebimObjectHelper.getInventories.mockReturnValue(mockFormattedInventory);

      const result = await business.fetchInventories(startDate);

      expect(mockApi.runProc).toHaveBeenCalledWith(
        'GetProductInventory',
        { Date: startDate }
      );
      expect(mockNebimObjectHelper.getInventories).toHaveBeenCalledWith(mockInventory);
      expect(result).toEqual(mockFormattedInventory);
    });

    it('should handle empty inventory', async () => {
      const startDate = '2024-01-01';
      const mockInventory = [];
      const mockFormattedInventory = [];

      mockApi.runProc.mockResolvedValue(mockInventory);
      mockNebimObjectHelper.getInventories.mockReturnValue(mockFormattedInventory);

      const result = await business.fetchInventories(startDate);

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      const startDate = '2024-01-01';
      const error = new Error('API Error');

      mockApi.runProc.mockRejectedValueOnce(error);

      await expect(business.fetchInventories(startDate)).rejects.toThrow('API Error');
    });
  });
});

