import { jest } from '@jest/globals';

const mockNebimProductBusiness = {
  getProductDetailListByItemCode: jest.fn(),
  fetchInventoriesByItemCode: jest.fn(),
};
const mockShopifyProductBusiness = {
  syncProductsDetailBulk: jest.fn(),
};
const mockShopifyInventoryBusiness = {
  syncInventoryBulk: jest.fn(),
};
const mockSyncedBarcode = {
  findOne: jest.fn(),
};

const mockCoreClass = jest.fn().mockImplementation(function CoreClass(tenant) {
  this.tenant = tenant;
  this.logger = { info: jest.fn(), info2: jest.fn(), error: jest.fn(), warn2: jest.fn() };
});

await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));
await jest.unstable_mockModule('../../business/nebim/ProductBusiness.js', () => ({
  default: jest.fn().mockImplementation(() => mockNebimProductBusiness),
}));
await jest.unstable_mockModule('../../business/shopify/ProductBusiness.js', () => ({
  default: jest.fn().mockImplementation(() => mockShopifyProductBusiness),
}));
await jest.unstable_mockModule('../../business/shopify/InventoryBusiness.js', () => ({
  default: jest.fn().mockImplementation(() => mockShopifyInventoryBusiness),
}));
await jest.unstable_mockModule('../../models/db/postgres/SyncedBarcode.js', () => ({
  default: mockSyncedBarcode,
}));

const { default: ProductSetupBusiness } = await import('../../business/ProductSetupBusiness.js');

describe('ProductSetupBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      id: 'tenant-1',
      name: 'demo.myshopify.com',
      shopify: {
        domain: 'demo.myshopify.com',
        isInventoryTracking: true,
      },
      nebim: {
        product: { barcodeTypeCode: 'EAN13' },
      },
    };

    jest.clearAllMocks();
    business = new ProductSetupBusiness(mockTenant);

    mockNebimProductBusiness.getProductDetailListByItemCode.mockResolvedValue([
      { erp_id: 'ABC', title: 'Test', variants: [{ barcode: '8600001' }] },
    ]);
    mockNebimProductBusiness.fetchInventoriesByItemCode.mockResolvedValue([
      { barcode: '8600001', quantity: 5 },
    ]);
    mockShopifyProductBusiness.syncProductsDetailBulk.mockResolvedValue(undefined);
    mockSyncedBarcode.findOne.mockResolvedValue({ productId: 'gid://shopify/Product/12345' });
    mockShopifyInventoryBusiness.syncInventoryBulk.mockResolvedValue(undefined);
  });

  it('should fetch Nebim data by item code, sync to Shopify, and return admin URL', async () => {
    const result = await business.runSetupTest('ABC');

    expect(mockNebimProductBusiness.getProductDetailListByItemCode).toHaveBeenCalledWith('ABC');
    expect(mockShopifyProductBusiness.syncProductsDetailBulk).toHaveBeenCalled();
    expect(mockNebimProductBusiness.fetchInventoriesByItemCode).toHaveBeenCalledWith('ABC');
    expect(mockShopifyInventoryBusiness.syncInventoryBulk).toHaveBeenCalled();
    expect(result).toEqual({
      itemCode: 'ABC',
      productId: 'gid://shopify/Product/12345',
      productUrl: 'https://demo.myshopify.com/admin/products/12345',
    });
  });

  it('should throw when Nebim returns no product rows', async () => {
    mockNebimProductBusiness.getProductDetailListByItemCode.mockResolvedValue([]);

    await expect(business.runSetupTest('MISSING')).rejects.toThrow('Ürün bulunamadı: MISSING');
  });
});
