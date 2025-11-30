import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockApi = {
  query: jest.fn(),
};

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

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: ShopifyStoreBusiness } = await import('../../../business/shopify/StoreBusiness.js');

describe('ShopifyStoreBusiness', () => {
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
    business = new ShopifyStoreBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchStores', () => {
    it('should fetch stores successfully', async () => {
      const mockStores = [
        { id: 'store1', name: 'Store 1' },
        { id: 'store2', name: 'Store 2' },
      ];

      mockApi.query.mockResolvedValue({
        data: {
          publications: {
            nodes: mockStores,
          },
        },
      });

      const result = await business.fetchStores();

      expect(mockApi.query).toHaveBeenCalled();
      expect(result).toEqual(mockStores);
    });

    it('should return undefined when GraphQL errors occur', async () => {
      mockApi.query.mockResolvedValue({
        errors: [{ message: 'GraphQL Error' }],
      });

      const result = await business.fetchStores();

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('publishProducts', () => {
    it('should publish products to stores successfully', async () => {
      const productIds = ['product1', 'product2'];
      const storeIds = ['store1', 'store2'];
      const publishDate = '2024-01-01T00:00:00Z';

      mockApi.query.mockResolvedValue({
        data: {
          publishablePublish: {
            publishable: { id: 'product1' },
          },
        },
      });

      const result = await business.publishProducts(productIds, storeIds, publishDate);

      expect(mockApi.query).toHaveBeenCalledTimes(4); // 2 products * 2 stores
      expect(result).toHaveLength(4);
    });

    it('should handle GraphQL errors during publishing', async () => {
      const productIds = ['product1'];
      const storeIds = ['store1'];

      mockApi.query.mockResolvedValue({
        errors: [{ message: 'Publish failed' }],
      });

      const result = await business.publishProducts(productIds, storeIds);

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should use current date when publishDate is not provided', async () => {
      const productIds = ['product1'];
      const storeIds = ['store1'];

      mockApi.query.mockResolvedValue({
        data: {
          publishablePublish: {
            publishable: { id: 'product1' },
          },
        },
      });

      await business.publishProducts(productIds, storeIds);

      expect(mockApi.query).toHaveBeenCalled();
      const callArgs = mockApi.query.mock.calls[0][1];
      expect(callArgs.input.publishDate).toBeDefined();
    });
  });

  describe('fetchLocations', () => {
    it('should fetch primary locations only by default', async () => {
      const mockLocations = {
        edges: [
          { node: { id: 'loc1', isPrimary: true } },
          { node: { id: 'loc2', isPrimary: false } },
          { node: { id: 'loc3', isPrimary: true } },
        ],
      };

      mockApi.query.mockResolvedValue({
        data: {
          locations: mockLocations,
        },
      });

      const result = await business.fetchLocations();

      expect(result).toHaveLength(2);
      expect(result.every(loc => loc.node.isPrimary === true)).toBe(true);
    });

    it('should fetch all locations when onlyPrimaries is false', async () => {
      const mockLocations = {
        edges: [
          { node: { id: 'loc1', isPrimary: true } },
          { node: { id: 'loc2', isPrimary: false } },
        ],
      };

      mockApi.query.mockResolvedValue({
        data: {
          locations: mockLocations,
        },
      });

      const result = await business.fetchLocations(false);

      expect(result).toHaveLength(2);
    });

    it('should return undefined when GraphQL errors occur', async () => {
      mockApi.query.mockResolvedValue({
        errors: [{ message: 'GraphQL Error' }],
      });

      const result = await business.fetchLocations();

      expect(business.logger.error).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('checkStore', () => {
    it('should check store connection', async () => {
      mockApi.query.mockResolvedValue({
        data: {},
      });

      await business.checkStore();

      expect(mockApi.query).toHaveBeenCalled();
    });
  });
});

