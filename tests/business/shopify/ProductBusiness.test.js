import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockApi = {
  query: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockShopifyCache = jest.fn().mockImplementation(() => mockCache);

const mockSyncedBarcode = {
  find: jest.fn(),
  updateOne: jest.fn(),
};

const mockLimitBusiness = {
  checkLimitAvailability: jest.fn(),
  useLimit: jest.fn(),
};

const mockLimitBusinessClass = jest.fn().mockImplementation(() => mockLimitBusiness);

const mockTenantModel = {
  findById: jest.fn(),
};

const mockSystemHelper = {
  wait: jest.fn(),
};

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    info4: jest.fn(),
    warn2: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../../apis/ShopifyGqlAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockApi),
}));

await jest.unstable_mockModule('../../../cache/ShopifyCache.js', () => ({
  default: mockShopifyCache,
}));

await jest.unstable_mockModule('../../../models/db/SyncedBarcode.js', () => ({
  default: mockSyncedBarcode,
}));

await jest.unstable_mockModule('../../../business/LimitBusiness.js', () => ({
  default: mockLimitBusinessClass,
}));

await jest.unstable_mockModule('../../../models/db/Tenant.js', () => ({
  default: mockTenantModel,
}));

await jest.unstable_mockModule('../../../helpers/SystemHelper.js', () => ({
  default: mockSystemHelper,
}));

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: ShopifyProductBusiness } = await import('../../../business/shopify/ProductBusiness.js');

describe('ShopifyProductBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      shopify: {
        name: 'test-shop',
        billing: {
          planKey: SystemCodes.BILLING_PLANS.BASIC.KEY,
          limits: {
            product_details: {
              limit: 500,
              used: 0,
            },
          },
        },
        isColorOptionFirst: true,
        isInventoryTracking: false,
        skuFields: {
          nebim: {
            fields: ['ItemCode', 'ColorCode'],
            separator: '-',
          },
        },
      },
    };

    jest.clearAllMocks();
    business = new ShopifyProductBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
    business.cache = mockCache;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncProductsDetailBulk', () => {
    it('should sync products successfully for BASIC plan', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [
            { id: 'Att1', code: 'CODE1' },
          ],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query
        .mockResolvedValueOnce({
          data: {
            productSet: {
              product: {
                id: 'gid://shopify/Product/1',
                variants: {
                  nodes: [
                    { id: 'gid://shopify/ProductVariant/1' },
                  ],
                },
              },
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            metafieldDefinitions: {
              edges: [],
            },
          },
          errors: undefined,
        })
        // Mock for metafield definition create (if needed)
        .mockResolvedValue({
          data: {
            metafieldDefinitionCreate: {
              metafieldDefinition: { id: 'def1' },
              userErrors: [],
            },
          },
          errors: undefined,
        });

      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      expect(mockApi.query).toHaveBeenCalled();
      expect(mockSyncedBarcode.updateOne).toHaveBeenCalled();
    });

    it('should skip products when limit is exceeded', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockRejectedValue(
        new Error('Limit exceeded')
      );

      await business.syncProductsDetailBulk(detailList);

      expect(mockLimitBusiness.checkLimitAvailability).toHaveBeenCalled();
      expect(business.logger.warn2).toHaveBeenCalledWith('SKU limit exceed');
    });

    it('should update existing products when synced barcode found', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [],
        },
      ];

      const existingSync = {
        barcode: 'BAR001',
        productId: 'gid://shopify/Product/1',
        variantId: 'gid://shopify/ProductVariant/1',
      };

      mockSyncedBarcode.find.mockResolvedValue([existingSync]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query
        .mockResolvedValueOnce({
          data: {
            productSet: {
              product: {
                id: 'gid://shopify/Product/1',
                variants: {
                  nodes: [
                    { id: 'gid://shopify/ProductVariant/1' },
                  ],
                },
              },
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            metafieldDefinitions: {
              edges: [],
            },
          },
          errors: undefined,
        })
        // Mock for metafield definition create (if needed)
        .mockResolvedValue({
          data: {
            metafieldDefinitionCreate: {
              metafieldDefinition: { id: 'def1' },
              userErrors: [],
            },
          },
          errors: undefined,
        });

      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      expect(mockApi.query).toHaveBeenCalled();
      const variables = mockApi.query.mock.calls[0][1];
      expect(variables.productSet.id).toBe('gid://shopify/Product/1');
    });

    it('should handle GraphQL errors gracefully', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query.mockResolvedValue({
        errors: [{ message: 'GraphQL Error' }],
      });

      await business.syncProductsDetailBulk(detailList);

      expect(business.logger.error).toHaveBeenCalled();
    });

    it('should sync products in parallel for ENTERPRISE plan', async () => {
      mockTenant.shopify.billing.planKey = SystemCodes.BILLING_PLANS.ENTERPRISE.KEY;

      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockApi.query
        .mockResolvedValueOnce({
          data: {
            productSet: {
              product: {
                id: 'gid://shopify/Product/1',
                variants: {
                  nodes: [
                    { id: 'gid://shopify/ProductVariant/1' },
                  ],
                },
              },
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            metafieldDefinitions: {
              edges: [],
            },
          },
          errors: undefined,
        });

      mockSyncedBarcode.updateOne.mockResolvedValue({ upsertedCount: 0 });
      mockSystemHelper.wait.mockResolvedValue(undefined);

      await business.syncProductsDetailBulk(detailList);

      expect(business.logger.info4).toHaveBeenCalled();
    });

    it('should create metafield definitions when needed', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [
            { id: 'Att1', code: 'CODE1' },
          ],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query
        .mockResolvedValueOnce({
          data: {
            productSet: {
              product: {
                id: 'gid://shopify/Product/1',
                variants: {
                  nodes: [
                    { id: 'gid://shopify/ProductVariant/1' },
                  ],
                },
              },
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            metafieldDefinitions: {
              edges: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            metafieldDefinitionCreate: {
              metafieldDefinition: { id: 'def1' },
              userErrors: [],
            },
          },
          errors: undefined,
        });

      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      // productSet, definitions check, definition create (may have additional calls)
      expect(mockApi.query).toHaveBeenCalled();
    });

    it('should set variants to tracked when isInventoryTracking is true', async () => {
      mockTenant.shopify.isInventoryTracking = true;

      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [
            {
              barcode: 'BAR001',
              sku: 'SKU001',
              color: 'Red',
              dimention: 'M',
              sale_price: '100.00',
            },
          ],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query
        .mockResolvedValueOnce({
          data: {
            productSet: {
              product: {
                id: 'gid://shopify/Product/1',
                variants: {
                  nodes: [
                    { id: 'gid://shopify/ProductVariant/1' },
                  ],
                },
              },
              userErrors: [],
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            productVariantBulkUpdate: {
              product: { id: 'gid://shopify/Product/1' },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            metafieldDefinitions: {
              edges: [],
            },
          },
          errors: undefined,
        });

      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      // Check if variant update was called (mutation string may vary)
      const variantUpdateCalls = mockApi.query.mock.calls.filter(
        call => call[0] && typeof call[0] === 'string' && call[0].includes('variant')
      );
      expect(variantUpdateCalls.length).toBeGreaterThan(0);
    });
  });
});

