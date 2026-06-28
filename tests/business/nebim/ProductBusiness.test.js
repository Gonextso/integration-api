import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockApi = {
  runProc: jest.fn(),
};

const mockNebimObjectHelper = {
  getDetailList: jest.fn(),
  getInventories: jest.fn(),
  getFindInStoreByBarcode: jest.fn(),
  getStoreInfoList: jest.fn(),
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
        product: {
          barcodeTypeCode: 'EAN13',
        },
        order: {
          store: 'WEB_STORE',
        },
        procNames: {
          product: {
            details: 'GetProductDetails',
            price: 'GetProductPrices',
            inventory: 'GetProductInventory',
            findInStore: 'sp_GO_FindInStore',
            storeInfo: 'sp_GO_GetStoreInfo',
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

  describe('sync proc query wiring', () => {
    it('should map all tenant product settings to details and price procs (product sync)', async () => {
      const startDate = '2024-06-15T08:00:00.000Z';
      mockTenant.nebim.product = {
        barcodeTypeCode: 'CODE128',
        priceSellCode: 'PSF',
        priceCompareCode: 'LSF',
        isColorBased: true,
        useInternetOnVariant: true,
        usedSeparatorOnColorAndItem: '/',
        usedSeparatorOnColorAndItemDescriptions: ':',
      };
      business = new NebimProductBusiness(mockTenant);
      business.tenant = mockTenant;
      business.api = mockApi;

      mockApi.runProc
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockNebimObjectHelper.getDetailList.mockReturnValue([]);

      await business.getProductDetailList(startDate);

      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        1,
        'GetProductDetails',
        {
          Date: startDate,
          BarcodeTypeCode: 'CODE128',
          IsColorBased: 1,
          UseInternetOnVariant: 1,
          UsedSeparatorOnColorAndItem: '/',
          UsedSeparatorOnColorAndItemDescriptions: ':',
        },
      );
      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        2,
        'GetProductPrices',
        {
          Date: startDate,
          BarcodeTypeCode: 'CODE128',
          SalePriceGroupCode: 'PSF',
          PriceGroupCode: 'LSF',
        },
      );
    });

    it('should map tenant inventory settings to inventory proc (inventory sync)', async () => {
      const startDate = '2024-06-15T08:00:00.000Z';
      mockTenant.nebim.product = {
        barcodeTypeCode: 'CODE128',
        responsibilityAreaCode: 'ECOM',
      };
      mockTenant.nebim.order = { store: 'MAG01' };
      business = new NebimProductBusiness(mockTenant);
      business.tenant = mockTenant;
      business.api = mockApi;

      mockApi.runProc.mockResolvedValue([]);
      mockNebimObjectHelper.getInventories.mockReturnValue([]);

      await business.fetchInventories(startDate);

      expect(mockApi.runProc).toHaveBeenCalledWith(
        'GetProductInventory',
        {
          Date: startDate,
          BarcodeTypeCode: 'CODE128',
          OrderStoreCode: 'MAG01',
          ResponsibiltyAreaCode: 'ECOM',
        },
      );
    });

    it('should forward startDate unchanged; date filtering is handled by the Nebim proc', async () => {
      const startDate = '2023-01-01T00:00:00.000Z';
      mockApi.runProc
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockNebimObjectHelper.getDetailList.mockReturnValue([]);

      await business.getProductDetailList(startDate);

      expect(mockApi.runProc.mock.calls[0][1].Date).toBe(startDate);
      expect(mockApi.runProc.mock.calls[1][1].Date).toBe(startDate);
    });
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
        {
          Date: startDate,
          BarcodeTypeCode: 'EAN13',
          IsColorBased: 0,
          UseInternetOnVariant: 0,
          UsedSeparatorOnColorAndItem: '-',
          UsedSeparatorOnColorAndItemDescriptions: ' ',
        }
      );
      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        2,
        'GetProductPrices',
        { Date: startDate, BarcodeTypeCode: 'EAN13' }
      );
      expect(mockNebimObjectHelper.getDetailList).toHaveBeenCalledWith(
        mockDetails,
        mockPrices,
        mockTenant
      );
      expect(result).toEqual(mockFormattedList);
    });

    it('should pass price group codes to price proc when configured', async () => {
      mockTenant.nebim.product.priceSellCode = 'PSF';
      mockTenant.nebim.product.priceCompareCode = 'LSF';
      business.tenant = mockTenant;

      const startDate = '2024-01-01';
      mockApi.runProc
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockNebimObjectHelper.getDetailList.mockReturnValue([]);

      await business.getProductDetailList(startDate);

      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        1,
        'GetProductDetails',
        {
          Date: startDate,
          BarcodeTypeCode: 'EAN13',
          IsColorBased: 0,
          UseInternetOnVariant: 0,
          UsedSeparatorOnColorAndItem: '-',
          UsedSeparatorOnColorAndItemDescriptions: ' ',
        }
      );
      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        2,
        'GetProductPrices',
        {
          Date: startDate,
          BarcodeTypeCode: 'EAN13',
          SalePriceGroupCode: 'PSF',
          PriceGroupCode: 'LSF',
        }
      );
    });

    it('should pass color-based settings to details proc when configured', async () => {
      mockTenant.nebim.product.isColorBased = true;
      mockTenant.nebim.product.useInternetOnVariant = true;
      mockTenant.nebim.product.usedSeparatorOnColorAndItem = '_';
      mockTenant.nebim.product.usedSeparatorOnColorAndItemDescriptions = '|';
      business = new NebimProductBusiness(mockTenant);
      business.tenant = mockTenant;
      business.api = mockApi;

      const startDate = '2024-01-01';
      mockApi.runProc
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockNebimObjectHelper.getDetailList.mockReturnValue([]);

      await business.getProductDetailList(startDate);

      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        1,
        'GetProductDetails',
        {
          Date: startDate,
          BarcodeTypeCode: 'EAN13',
          IsColorBased: 1,
          UseInternetOnVariant: 1,
          UsedSeparatorOnColorAndItem: '_',
          UsedSeparatorOnColorAndItemDescriptions: '|',
        },
      );
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
        { Date: startDate, BarcodeTypeCode: 'EAN13', OrderStoreCode: 'WEB_STORE', ResponsibiltyAreaCode: 'WEB' }
      );
      expect(mockNebimObjectHelper.getInventories).toHaveBeenCalledWith(mockInventory);
      expect(result).toEqual(mockFormattedInventory);
    });

    it('should pass configured responsibility area code to inventory proc', async () => {
      mockTenant.nebim.product.responsibilityAreaCode = 'ECOM';
      business = new NebimProductBusiness(mockTenant);
      business.tenant = mockTenant;
      business.api = mockApi;

      mockApi.runProc.mockResolvedValue([]);
      mockNebimObjectHelper.getInventories.mockReturnValue([]);

      await business.fetchInventories('2024-01-01');

      expect(mockApi.runProc).toHaveBeenCalledWith(
        'GetProductInventory',
        expect.objectContaining({ ResponsibiltyAreaCode: 'ECOM' }),
      );
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

  describe('fetchStoreInfo', () => {
    it('should call RunProc with empty parameters', async () => {
      const mockRows = [{ Desc: 'Kadıköy Mağazası' }];
      const mockStores = [{ desc: 'Kadıköy Mağazası' }];

      mockApi.runProc.mockResolvedValue(mockRows);
      mockNebimObjectHelper.getStoreInfoList.mockReturnValue(mockStores);

      const result = await business.fetchStoreInfo();

      expect(mockApi.runProc).toHaveBeenCalledWith('sp_GO_GetStoreInfo', {});
      expect(mockNebimObjectHelper.getStoreInfoList).toHaveBeenCalledWith(mockRows);
      expect(result).toEqual(mockStores);
    });
  });

  describe('fetchFindInStoreByBarcodes', () => {
    it('should call RunProc with comma-separated barcodes', async () => {
      const barcodes = ['8600000000001', '8600000000002'];
      const mockRows = [{ Barcode: '8600000000001', StoreDesc: 'Kadıköy Mağazası', Inventory: 3 }];
      const mockGrouped = [{ barcode: '8600000000001', stores: [{ desc: 'Kadıköy Mağazası', inventory_count: 3 }] }];

      mockApi.runProc.mockResolvedValue(mockRows);
      mockNebimObjectHelper.getFindInStoreByBarcode.mockReturnValue(mockGrouped);

      const result = await business.fetchFindInStoreByBarcodes(barcodes);

      expect(mockApi.runProc).toHaveBeenCalledWith(
        'sp_GO_FindInStore',
        { BarcodeTypeCode: 'EAN13', Barcodes: '8600000000001,8600000000002' }
      );
      expect(mockNebimObjectHelper.getFindInStoreByBarcode).toHaveBeenCalledWith(mockRows);
      expect(result).toEqual(mockGrouped);
    });

    it('should return empty array when barcodes list is empty', async () => {
      const result = await business.fetchFindInStoreByBarcodes([]);
      expect(result).toEqual([]);
      expect(mockApi.runProc).not.toHaveBeenCalled();
    });
  });

  describe('getProductDetailListByItemCode', () => {
    it('should pass ItemCode to details and price procs', async () => {
      mockApi.runProc
        .mockResolvedValueOnce([{ ItemCode: 'ABC' }])
        .mockResolvedValueOnce([{ Barcode: '8600001' }]);
      mockNebimObjectHelper.getDetailList.mockReturnValue([{ erp_id: 'ABC' }]);

      const result = await business.getProductDetailListByItemCode('ABC');

      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        1,
        'GetProductDetails',
        expect.objectContaining({ ItemCode: 'ABC' }),
      );
      expect(mockApi.runProc).toHaveBeenNthCalledWith(
        2,
        'GetProductPrices',
        expect.objectContaining({ ItemCode: 'ABC' }),
      );
      expect(result).toEqual([{ erp_id: 'ABC' }]);
    });
  });

  describe('fetchInventoriesByItemCode', () => {
    it('should pass ItemCode to inventory proc', async () => {
      mockApi.runProc.mockResolvedValue([{ Barcode: '8600001', Inventory: 2 }]);
      mockNebimObjectHelper.getInventories.mockReturnValue([{ barcode: '8600001', quantity: 2 }]);

      const result = await business.fetchInventoriesByItemCode('ABC');

      expect(mockApi.runProc).toHaveBeenCalledWith(
        'GetProductInventory',
        expect.objectContaining({ ItemCode: 'ABC' }),
      );
      expect(result).toEqual([{ barcode: '8600001', quantity: 2 }]);
    });
  });
});

