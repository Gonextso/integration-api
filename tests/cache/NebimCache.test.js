import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import CacheFields from '../../enums/CacheFields.js';

// Mock dependencies before imports
const mockRedisAPI = {
  setCache: jest.fn(),
  getCache: jest.fn(),
  getAllCache: jest.fn(),
  deleteCache: jest.fn(),
  flushCache: jest.fn(),
  lock: jest.fn(),
  unlock: jest.fn(),
};

const mockStringHelper = {
  compareStrings: jest.fn(),
};

const mockCoreCache = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    error: jest.fn(),
  },
  redis: mockRedisAPI,
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  lock: jest.fn(),
  unlock: jest.fn(),
}));

await jest.unstable_mockModule('../../apis/RedisAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockRedisAPI),
}));

await jest.unstable_mockModule('../../helpers/StringHelper.js', () => ({
  default: mockStringHelper,
}));

await jest.unstable_mockModule('../../core/CoreCache.js', () => ({
  default: mockCoreCache,
}));

const { default: NebimCache } = await import('../../cache/NebimCache.js');

describe('NebimCache', () => {
  let cache;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    jest.clearAllMocks();
    cache = new NebimCache(mockTenant);
    cache.tenant = mockTenant;
    cache.redis = mockRedisAPI;
    cache.logger = {
      info: jest.fn(),
      info2: jest.fn(),
      error: jest.fn(),
    };
    cache.get = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAddressCode', () => {
    it('should find address code by city and district', async () => {
      const city = 'Istanbul';
      const district = 'Kadikoy';
      const allAddressCodes = [
        {
          CityCode: '3401',
          CityDescription: 'Istanbul',
          DistrictCode: '340101',
          DistrictDescription: 'Kadikoy',
        },
        {
          CityCode: '3402',
          CityDescription: 'Ankara',
          DistrictCode: '340201',
          DistrictDescription: 'Cankaya',
        },
      ];

      cache.get.mockResolvedValue(allAddressCodes);
      // Mock compareStrings to return true for first item (both city and district match)
      // and false for second item
      mockStringHelper.compareStrings.mockImplementation((str1, str2) => {
        // First item: Istanbul matches Istanbul, Kadikoy matches Kadikoy
        if (str1 === 'Istanbul' && str2 === 'Istanbul') return true;
        if (str1 === 'Kadikoy' && str2 === 'Kadikoy') return true;
        // Second item: Ankara matches Ankara but Cankaya doesn't match Kadikoy
        if (str1 === 'Ankara' && str2 === 'Ankara') return true;
        if (str1 === 'Cankaya' && str2 === 'Kadikoy') return false;
        return false;
      });

      const result = await cache.findAddressCode({ city, district });

      expect(cache.get).toHaveBeenCalledWith(CacheFields.NEBIM.ADDRESS_CODES);
      expect(cache.logger.info).toHaveBeenCalledWith(`${allAddressCodes.length} addresses fetched from cache`);
      expect(result).toEqual(allAddressCodes[0]);
    });

    it('should return undefined when address code not found', async () => {
      const city = 'Unknown';
      const district = 'Unknown';
      const allAddressCodes = [
        {
          CityCode: '3401',
          CityDescription: 'Istanbul',
          DistrictCode: '340101',
          DistrictDescription: 'Kadikoy',
        },
      ];

      cache.get.mockResolvedValue(allAddressCodes);
      mockStringHelper.compareStrings.mockReturnValue(false);

      const result = await cache.findAddressCode({ city, district });

      expect(result).toBeUndefined();
    });

    it('should handle empty address codes array', async () => {
      const city = 'Istanbul';
      const district = 'Kadikoy';

      cache.get.mockResolvedValue([]);

      const result = await cache.findAddressCode({ city, district });

      expect(cache.logger.info).toHaveBeenCalledWith('0 addresses fetched from cache');
      expect(result).toBeUndefined();
    });

    it('should handle null address codes', async () => {
      const city = 'Istanbul';
      const district = 'Kadikoy';

      cache.get.mockResolvedValue(null);

      const result = await cache.findAddressCode({ city, district });

      expect(cache.logger.info).toHaveBeenCalledWith('0 addresses fetched from cache');
      expect(result).toBeUndefined();
    });

    it('should use StringHelper.compareStrings for matching', async () => {
      const city = 'Istanbul';
      const district = 'Kadikoy';
      const allAddressCodes = [
        {
          CityCode: '3401',
          CityDescription: 'Istanbul',
          DistrictCode: '340101',
          DistrictDescription: 'Kadikoy',
        },
      ];

      cache.get.mockResolvedValue(allAddressCodes);
      mockStringHelper.compareStrings
        .mockReturnValueOnce(true) // City match
        .mockReturnValueOnce(true); // District match

      await cache.findAddressCode({ city, district });

      expect(mockStringHelper.compareStrings).toHaveBeenCalledWith('Istanbul', 'Istanbul');
      expect(mockStringHelper.compareStrings).toHaveBeenCalledWith('Kadikoy', 'Kadikoy');
    });
  });
});

