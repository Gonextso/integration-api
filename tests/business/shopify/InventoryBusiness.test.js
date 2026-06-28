import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockApi = {
  query: jest.fn(),
};

const mockStoreBusiness = {
  fetchLocations: jest.fn(),
};

const mockStoreBusinessClass = jest.fn().mockImplementation(() => mockStoreBusiness);

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../../apis/ShopifyGqlAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockApi),
}));

await jest.unstable_mockModule('../../../business/shopify/StoreBusiness.js', () => ({
  default: mockStoreBusinessClass,
}));

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: ShopifyInventoryBusiness } = await import('../../../business/shopify/InventoryBusiness.js');

const inventorySetQuantitiesResponse = {
  data: {
    inventorySetQuantities: {
      inventoryAdjustmentGroup: {
        reason: 'correction',
        changes: [],
      },
      userErrors: [],
    },
  },
};

const assertInventorySetPayload = (variables) => {
  expect(variables).toHaveProperty('idempotencyKey');
  expect(typeof variables.idempotencyKey).toBe('string');
  expect(variables.idempotencyKey.length).toBeGreaterThan(0);
  expect(variables.input).not.toHaveProperty('ignoreCompareQuantity');
  expect(variables.input.name).toBe('available');
  expect(variables.input.reason).toBe('correction');
  for (const quantity of variables.input.quantities) {
    expect(quantity).toHaveProperty('changeFromQuantity', null);
  }
};

describe('ShopifyInventoryBusiness', () => {
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
    business = new ShopifyInventoryBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
    business.store = mockStoreBusiness;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncInventoryBulk', () => {
    it('should sync inventory bulk successfully', async () => {
      const inventoryList = [
        { barcode: 'BAR001', quantity: 100 },
        { barcode: 'BAR002', quantity: 50 },
      ];

      const mockLocations = [
        { node: { id: 'loc1', isPrimary: true } },
      ];

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            inventoryItems: {
              edges: [
                { node: { id: 'inv1', sku: 'SKU001', variant: { barcode: 'BAR001' } } },
                { node: { id: 'inv2', sku: 'SKU002', variant: { barcode: 'BAR002' } } },
              ],
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        })
        .mockResolvedValueOnce(inventorySetQuantitiesResponse);

      mockStoreBusiness.fetchLocations.mockResolvedValue(mockLocations);

      await business.syncInventoryBulk(inventoryList);

      expect(mockStoreBusiness.fetchLocations).toHaveBeenCalled();
      expect(mockApi.query).toHaveBeenCalledTimes(2);

      const setInventoryCall = mockApi.query.mock.calls[1];
      expect(setInventoryCall[0]).toContain('inventorySetQuantities');
      expect(setInventoryCall[0]).toContain('@idempotent');
      assertInventorySetPayload(setInventoryCall[1]);
    });

    it('should handle pagination when fetching inventory IDs', async () => {
      const inventoryList = [
        { barcode: 'BAR001', quantity: 100 },
      ];

      const mockLocations = [
        { node: { id: 'loc1', isPrimary: true } },
      ];

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            inventoryItems: {
              edges: [
                { node: { id: 'inv1', sku: 'SKU001', variant: { barcode: 'BAR001' } }, cursor: 'cursor1' },
              ],
              pageInfo: {
                hasNextPage: true,
              },
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            inventoryItems: {
              edges: [
                { node: { id: 'inv2', sku: 'SKU002', variant: { barcode: 'BAR002' } }, cursor: 'cursor2' },
              ],
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        })
        .mockResolvedValueOnce(inventorySetQuantitiesResponse);

      mockStoreBusiness.fetchLocations.mockResolvedValue(mockLocations);

      await business.syncInventoryBulk(inventoryList);

      expect(mockApi.query).toHaveBeenCalledTimes(3);
      assertInventorySetPayload(mockApi.query.mock.calls[2][1]);
    });

    it('should handle GraphQL errors when fetching inventory IDs', async () => {
      const inventoryList = [
        { barcode: 'BAR001', quantity: 100 },
      ];

      mockApi.query.mockResolvedValueOnce({
        errors: [{ message: 'GraphQL Error' }],
        data: undefined,
      });

      mockStoreBusiness.fetchLocations.mockResolvedValue([
        { node: { id: 'loc1', isPrimary: true } },
      ]);

      await business.syncInventoryBulk(inventoryList);

      expect(business.logger.error).toHaveBeenCalled();
      expect(mockStoreBusiness.fetchLocations).not.toHaveBeenCalled();
    });

    it('should handle unset inventories when barcode not found', async () => {
      const inventoryList = [
        { barcode: 'BAR001', quantity: 100 },
        { barcode: 'BAR999', quantity: 50 },
      ];

      const mockLocations = [
        { node: { id: 'loc1', isPrimary: true } },
      ];

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            inventoryItems: {
              edges: [
                { node: { id: 'inv1', sku: 'SKU001', variant: { barcode: 'BAR001' } } },
              ],
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        })
        .mockResolvedValueOnce(inventorySetQuantitiesResponse);

      mockStoreBusiness.fetchLocations.mockResolvedValue(mockLocations);

      await business.syncInventoryBulk(inventoryList);

      expect(mockApi.query).toHaveBeenCalledTimes(2);
      const setInventoryVariables = mockApi.query.mock.calls[1][1];
      assertInventorySetPayload(setInventoryVariables);
      expect(setInventoryVariables.input.quantities).toHaveLength(1);
      expect(setInventoryVariables.input.quantities[0].inventoryItemId).toBe('inv1');
    });

    it('should batch inventory updates in chunks of 250', async () => {
      const inventoryList = Array.from({ length: 300 }, (_, i) => ({
        barcode: `BAR${i.toString().padStart(3, '0')}`,
        quantity: 10,
      }));

      const mockInventoryIds = inventoryList.map((inv, i) => ({
        id: `inv${i}`,
        sku: `SKU${i}`,
        barcode: inv.barcode,
      }));

      const mockLocations = [
        { node: { id: 'loc1', isPrimary: true } },
      ];

      const inventoryEdges = mockInventoryIds.map((inv, i) => ({
        node: {
          id: inv.id,
          sku: inv.sku,
          variant: { barcode: inv.barcode },
        },
        cursor: `cursor${i}`,
      }));

      mockApi.query
        .mockResolvedValueOnce({
          data: {
            inventoryItems: {
              edges: inventoryEdges,
              pageInfo: {
                hasNextPage: false,
              },
            },
          },
        })
        .mockResolvedValue(inventorySetQuantitiesResponse);

      mockStoreBusiness.fetchLocations.mockResolvedValue(mockLocations);

      await business.syncInventoryBulk(inventoryList);

      const setInventoryCalls = mockApi.query.mock.calls.filter(
        call => call[0] && typeof call[0] === 'string' && call[0].includes('inventorySetQuantities')
      );
      expect(setInventoryCalls.length).toBe(2);
      expect(setInventoryCalls[0][1].input.quantities).toHaveLength(250);
      expect(setInventoryCalls[1][1].input.quantities).toHaveLength(50);
      assertInventorySetPayload(setInventoryCalls[0][1]);
      assertInventorySetPayload(setInventoryCalls[1][1]);
    });
  });
});
