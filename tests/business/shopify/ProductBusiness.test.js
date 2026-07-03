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

const mockProductSyncedBatch = {
  create: jest.fn(),
  update: jest.fn(),
};

const mockProductBatchLog = {
  create: jest.fn(),
};

const mockLimitBusiness = {
  checkLimitAvailability: jest.fn(),
  syncUsageSnapshot: jest.fn(),
};

const mockLimitBusinessClass = jest.fn().mockImplementation(() => mockLimitBusiness);

const mockTenantModel = {
  findById: jest.fn(),
};

const mockSystemHelper = {
  wait: jest.fn(),
};

const mockSystemCache = {
  lockWithTimeout: jest.fn().mockResolvedValue(true),
  extendLock: jest.fn().mockResolvedValue(true),
  unlock: jest.fn().mockResolvedValue(undefined),
};

const mockSystemCacheClass = jest.fn().mockImplementation(() => mockSystemCache);

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    info4: jest.fn(),
    warn: jest.fn(),
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

await jest.unstable_mockModule('../../../models/db/postgres/SyncedBarcode.js', () => ({
  default: mockSyncedBarcode,
}));

await jest.unstable_mockModule('../../../models/db/postgres/ProductSyncedBatch.js', () => ({
  default: mockProductSyncedBatch,
}));

await jest.unstable_mockModule('../../../models/db/postgres/ProductBatchLog.js', () => ({
  default: mockProductBatchLog,
}));

await jest.unstable_mockModule('../../../business/LimitBusiness.js', () => ({
  default: mockLimitBusinessClass,
}));

await jest.unstable_mockModule('../../../models/db/postgres/Tenant.js', () => ({
  default: mockTenantModel,
}));

await jest.unstable_mockModule('../../../helpers/SystemHelper.js', () => ({
  default: mockSystemHelper,
}));

await jest.unstable_mockModule('../../../cache/SystemCache.js', () => ({
  default: mockSystemCacheClass,
}));

await jest.unstable_mockModule('../../../enums/CacheFields.js', () => ({
  default: {
    SYSTEM: {
      PRODUCT_SYNC_BARCODE_LOCK: 'product_sync_barcode_lock',
      PRODUCT_SYNC_TENANT_LOCK: 'product_sync_tenant_lock',
    },
  },
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
      id: 'test-tenant-id',
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
    mockSystemCache.lockWithTimeout.mockResolvedValue(true);
    mockSystemCache.extendLock.mockResolvedValue(true);
    mockSystemCache.unlock.mockResolvedValue(undefined);
    mockLimitBusiness.syncUsageSnapshot.mockResolvedValue(0);
    mockProductSyncedBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockProductSyncedBatch.update.mockResolvedValue({});
    mockProductBatchLog.create.mockResolvedValue({});
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
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
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
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
            errors: undefined,
          };
        }

        if (query.includes('metafieldDefinitionCreate')) {
          return {
            data: {
              metafieldDefinitionCreate: {
                metafieldDefinition: { id: 'def1' },
                userErrors: [],
              },
            },
            errors: undefined,
          };
        }

        return { data: {} };
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
        new Error('Limit exceed')
      );

      await business.syncProductsDetailBulk(detailList);

      expect(mockLimitBusiness.checkLimitAvailability).toHaveBeenCalledWith(
        SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS,
        1
      );
      expect(business.logger.warn2).toHaveBeenCalledWith(
        expect.stringContaining('SKU limit exceed')
      );
      // Skipped product must not reach Shopify
      const productSetCalls = mockApi.query.mock.calls.filter(
        ([query]) => typeof query === 'string' && query.includes('productSet(')
      );
      expect(productSetCalls).toHaveLength(0);
    });

    it('should continue with next products after one exceeds the limit', async () => {
      const buildProduct = (erpId, barcode) => ({
        erp_id: erpId,
        title: `Product ${erpId}`,
        category: 'Category1',
        variants: [
          {
            barcode,
            sku: `SKU-${barcode}`,
            color: 'Red',
            dimention: 'M',
            sale_price: '100.00',
          },
        ],
        attributes: [],
      });

      const detailList = [
        buildProduct('ITEM001', 'BAR001'),
        buildProduct('ITEM002', 'BAR002'),
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability
        .mockRejectedValueOnce(new Error('Limit exceed'))
        .mockResolvedValueOnce(undefined);
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            data: {
              productSet: {
                product: {
                  id: 'gid://shopify/Product/2',
                  variants: { nodes: [{ id: 'gid://shopify/ProductVariant/2' }] },
                },
                userErrors: [],
              },
            },
          };
        }
        if (query.includes('metafieldDefinitions')) {
          return { data: { metafieldDefinitions: { edges: [] } } };
        }
        if (query.includes('metafieldDefinitionCreate')) {
          return { data: { metafieldDefinitionCreate: { metafieldDefinition: { id: 'def1' }, userErrors: [] } } };
        }
        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      // First product skipped, second still synced
      expect(mockLimitBusiness.checkLimitAvailability).toHaveBeenCalledTimes(2);
      const productSetCalls = mockApi.query.mock.calls.filter(
        ([query]) => typeof query === 'string' && query.includes('productSet(')
      );
      expect(productSetCalls).toHaveLength(1);
    });

    it('should create a batch record with SYNC_PRODUCTS process and finalize counters', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [{ barcode: 'BAR001', sku: 'SKU001', color: 'Red', dimention: 'M', sale_price: '100.00' }],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockLimitBusiness.syncUsageSnapshot.mockResolvedValue(42);
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            data: {
              productSet: {
                product: { id: 'gid://shopify/Product/1', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/1' }] } },
                userErrors: [],
              },
            },
          };
        }
        if (query.includes('metafieldDefinitions')) {
          return { data: { metafieldDefinitions: { edges: [] } } };
        }
        if (query.includes('metafieldDefinitionCreate')) {
          return { data: { metafieldDefinitionCreate: { metafieldDefinition: { id: 'def1' }, userErrors: [] } } };
        }
        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList, [], { startDate: '2026-07-01T00:00:00Z' });

      expect(mockProductSyncedBatch.create).toHaveBeenCalledWith(expect.objectContaining({
        process: SystemCodes.PROCESS.SYNC_PRODUCTS,
        request: { startDate: '2026-07-01T00:00:00Z', endDate: null },
        tenant: mockTenant.id,
      }));
      expect(mockProductSyncedBatch.update).toHaveBeenCalledWith({ id: 'batch-1' }, {
        numbers: {
          total: 1,
          createProductTotal: 1,
          createProductSuccess: 1,
          createProductError: 0,
          createProductSkippedTotal: 0,
        },
        isErrorLogExistsForThisBatch: false,
      });
      const steps = mockProductBatchLog.create.mock.calls.map(([arg]) => arg.step);
      expect(steps).toContain('START');
      expect(steps).toContain('DONE');
    });

    it('should log SKU_LIMIT_SKIP batch step and count skipped products', async () => {
      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [{ barcode: 'BAR001', sku: 'SKU001', color: 'Red', dimention: 'M', sale_price: '100.00' }],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockRejectedValue(new Error('Limit exceed'));

      await business.syncProductsDetailBulk(detailList);

      expect(mockProductBatchLog.create).toHaveBeenCalledWith(expect.objectContaining({
        productSyncedBatchId: 'batch-1',
        step: 'SKU_LIMIT_SKIP',
        level: 'WARN',
      }));
      expect(mockProductSyncedBatch.update).toHaveBeenCalledWith({ id: 'batch-1' }, expect.objectContaining({
        numbers: expect.objectContaining({
          createProductSuccess: 0,
          createProductSkippedTotal: 1,
        }),
      }));
    });

    it('should not create a batch record when tenant lock is not acquired', async () => {
      mockSystemCache.lockWithTimeout.mockResolvedValue(false);

      await business.syncProductsDetailBulk([
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [{ barcode: 'BAR001', sku: 'SKU001', color: 'Red', dimention: 'M', sale_price: '100.00' }],
          attributes: [],
        },
      ]);

      expect(mockProductSyncedBatch.create).not.toHaveBeenCalled();
      expect(mockProductBatchLog.create).not.toHaveBeenCalled();
    });

    it('should keep syncing when batch record creation fails', async () => {
      mockProductSyncedBatch.create.mockRejectedValue(new Error('db down'));

      const detailList = [
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [{ barcode: 'BAR001', sku: 'SKU001', color: 'Red', dimention: 'M', sale_price: '100.00' }],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            data: {
              productSet: {
                product: { id: 'gid://shopify/Product/1', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/1' }] } },
                userErrors: [],
              },
            },
          };
        }
        if (query.includes('metafieldDefinitions')) {
          return { data: { metafieldDefinitions: { edges: [] } } };
        }
        if (query.includes('metafieldDefinitionCreate')) {
          return { data: { metafieldDefinitionCreate: { metafieldDefinition: { id: 'def1' }, userErrors: [] } } };
        }
        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      // Sync must proceed; batch steps and finalize are skipped silently
      expect(mockSyncedBarcode.updateOne).toHaveBeenCalled();
      expect(mockProductBatchLog.create).not.toHaveBeenCalled();
      expect(mockProductSyncedBatch.update).not.toHaveBeenCalled();
    });

    it('should skip the whole run when tenant lock is not acquired', async () => {
      mockSystemCache.lockWithTimeout.mockResolvedValue(false);

      await business.syncProductsDetailBulk([
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [{ barcode: 'BAR001', sku: 'SKU001', color: 'Red', dimention: 'M', sale_price: '100.00' }],
          attributes: [],
        },
      ]);

      expect(business.logger.warn2).toHaveBeenCalledWith(
        expect.stringContaining('already in progress')
      );
      expect(mockApi.query).not.toHaveBeenCalled();
      expect(mockSystemCache.unlock).not.toHaveBeenCalled();
    });

    it('should release tenant lock even when the sync body throws', async () => {
      mockSyncedBarcode.find.mockRejectedValue(new Error('db down'));

      await expect(business.syncProductsDetailBulk([
        {
          erp_id: 'ITEM001',
          title: 'Test Product',
          category: 'Category1',
          variants: [{ barcode: 'BAR001', sku: 'SKU001', color: 'Red', dimention: 'M', sale_price: '100.00' }],
          attributes: [],
        },
      ])).rejects.toThrow('db down');

      expect(mockSystemCache.unlock).toHaveBeenCalledWith('product_sync_tenant_lock');
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
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
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
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
            errors: undefined,
          };
        }

        if (query.includes('metafieldDefinitionCreate')) {
          return {
            data: {
              metafieldDefinitionCreate: {
                metafieldDefinition: { id: 'def1' },
                userErrors: [],
              },
            },
            errors: undefined,
          };
        }

        return { data: {} };
      });

      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      expect(mockApi.query).toHaveBeenCalled();
      const variables = mockApi.query.mock.calls[0][1];
      expect(variables.productSet.id).toBe('gid://shopify/Product/1');
    });

    it('should send compareAtPrice when variant has compare_at_price', async () => {
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
              sale_price: 100,
              compare_at_price: 120,
            },
          ],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            data: {
              productSet: {
                product: {
                  id: 'gid://shopify/Product/1',
                  variants: {
                    nodes: [{ id: 'gid://shopify/ProductVariant/1' }],
                  },
                },
                userErrors: [],
              },
            },
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
            errors: undefined,
          };
        }

        if (query.includes('metafieldDefinitionCreate')) {
          return {
            data: {
              metafieldDefinitionCreate: {
                metafieldDefinition: { id: 'def1' },
                userErrors: [],
              },
            },
            errors: undefined,
          };
        }

        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      const productSetCall = mockApi.query.mock.calls.find(([query]) => query.includes('productSet('));
      const variables = productSetCall[1];
      expect(variables.productSet.variants[0]).toMatchObject({
        price: 100,
        compareAtPrice: 120,
      });
    });

    it('should send compareAtPrice null when variant has no compare_at_price', async () => {
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
              compare_at_price: null,
            },
          ],
          attributes: [],
        },
      ];

      mockSyncedBarcode.find.mockResolvedValue([]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockResolvedValue(undefined);
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            data: {
              productSet: {
                product: {
                  id: 'gid://shopify/Product/1',
                  variants: {
                    nodes: [{ id: 'gid://shopify/ProductVariant/1' }],
                  },
                },
                userErrors: [],
              },
            },
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
            errors: undefined,
          };
        }

        if (query.includes('metafieldDefinitionCreate')) {
          return {
            data: {
              metafieldDefinitionCreate: {
                metafieldDefinition: { id: 'def1' },
                userErrors: [],
              },
            },
            errors: undefined,
          };
        }

        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      const productSetCall = mockApi.query.mock.calls.find(([query]) => query.includes('productSet('));
      const variables = productSetCall[1];
      expect(variables.productSet.variants[0]).toMatchObject({
        price: '100.00',
        compareAtPrice: null,
      });
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
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            errors: [{ message: 'GraphQL Error' }],
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
            errors: undefined,
          };
        }

        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      expect(business.logger.error).toHaveBeenCalled();
      // Failed product is recorded on the batch
      expect(mockProductBatchLog.create).toHaveBeenCalledWith(expect.objectContaining({
        step: 'GRAPHQL_ERROR',
        level: 'ERROR',
      }));
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
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
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
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
            errors: undefined,
          };
        }

        if (query.includes('metafieldDefinitionCreate')) {
          return {
            data: {
              metafieldDefinitionCreate: {
                metafieldDefinition: { id: 'def1' },
                userErrors: [],
              },
            },
            errors: undefined,
          };
        }

        return { data: {} };
      });

      mockSyncedBarcode.updateOne.mockResolvedValue({ upsertedCount: 0 });
      mockSystemHelper.wait.mockResolvedValue(undefined);

      await business.syncProductsDetailBulk(detailList);

      expect(business.logger.info4).toHaveBeenCalled();
      // No per-variant charging; usage is derived and snapshotted once per run
      expect(mockLimitBusiness.checkLimitAvailability).not.toHaveBeenCalled();
      expect(mockLimitBusiness.syncUsageSnapshot).toHaveBeenCalledTimes(1);
      expect(mockLimitBusiness.syncUsageSnapshot).toHaveBeenCalledWith(SystemCodes.LIMIT_TYPE.PRODUCT_DETAILS);
    });

    it('should sync already-synced products on BASIC without a limit check (sequential path)', async () => {
      mockTenant.shopify.billing.planKey = SystemCodes.BILLING_PLANS.BASIC.KEY;

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

      mockSyncedBarcode.find.mockResolvedValue([
        {
          barcode: 'BAR001',
          productId: 'gid://shopify/Product/1',
          variantId: 'gid://shopify/ProductVariant/1',
        },
      ]);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockLimitBusiness.checkLimitAvailability.mockRejectedValue(new Error('Limit exceeded'));
      mockApi.query.mockImplementation(async (query) => {
        if (query.includes('productSet(')) {
          return {
            data: {
              productSet: {
                product: {
                  id: 'gid://shopify/Product/1',
                  variants: {
                    nodes: [{ id: 'gid://shopify/ProductVariant/1' }],
                  },
                },
                userErrors: [],
              },
            },
          };
        }

        if (query.includes('metafieldDefinitions')) {
          return {
            data: {
              metafieldDefinitions: {
                edges: [],
              },
            },
          };
        }

        if (query.includes('metafieldDefinitionCreate')) {
          return {
            data: {
              metafieldDefinitionCreate: {
                metafieldDefinition: { id: 'def1' },
                userErrors: [],
              },
            },
          };
        }

        return { data: {} };
      });
      mockSyncedBarcode.updateOne.mockResolvedValue({});

      await business.syncProductsDetailBulk(detailList);

      // Update-only products (all barcodes already synced) never touch the limit
      expect(mockLimitBusiness.checkLimitAvailability).not.toHaveBeenCalled();
      expect(mockApi.query).toHaveBeenCalled();
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

