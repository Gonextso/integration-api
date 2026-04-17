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
  normalizeString: jest.fn(),
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
const normalizeStringMock = (str) => (typeof str === 'string' ? str : '')
  .toLocaleLowerCase('tr-TR')
  .normalize('NFD')
  .replaceAll(/[\u0300-\u036f]/g, '');

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
      mockStringHelper.compareStrings.mockImplementation((str1, str2) => str1 === str2);
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

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
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

      const result = await cache.findAddressCode({ city, district });

      expect(result).toBeUndefined();
    });

    it('should handle empty address codes array', async () => {
      const city = 'Istanbul';
      const district = 'Kadikoy';

      cache.get.mockResolvedValue([]);
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

      const result = await cache.findAddressCode({ city, district });

      expect(cache.logger.info).toHaveBeenCalledWith('0 addresses fetched from cache');
      expect(result).toBeUndefined();
    });

    it('should handle null address codes', async () => {
      const city = 'Istanbul';
      const district = 'Kadikoy';

      cache.get.mockResolvedValue(null);
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

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
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

      await cache.findAddressCode({ city, district });

      expect(mockStringHelper.compareStrings).toHaveBeenCalledWith('Istanbul', 'Istanbul');
      expect(mockStringHelper.compareStrings).toHaveBeenCalledWith('Kadikoy', 'Kadikoy');
    });

    it('should match "Merkez" with "Merkez (Sirnak)" in same city', async () => {
      const allAddressCodes = [
        {
          CityCode: '7301',
          CityDescription: 'Sirnak',
          DistrictCode: '730101',
          DistrictDescription: 'Merkez (Sirnak)',
        },
      ];

      cache.get.mockResolvedValue(allAddressCodes);
      mockStringHelper.compareStrings.mockImplementation((str1, str2) => str1 === str2);
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

      const result = await cache.findAddressCode({ city: 'Sirnak', district: 'Merkez' });
      expect(result).toEqual(allAddressCodes[0]);
    });

    it('should not match district from another city', async () => {
      const allAddressCodes = [
        {
          CityCode: '7301',
          CityDescription: 'Sirnak',
          DistrictCode: '730101',
          DistrictDescription: 'Merkez (Sirnak)',
        },
        {
          CityCode: '2101',
          CityDescription: 'Diyarbakir',
          DistrictCode: '210101',
          DistrictDescription: 'Merkez',
        },
      ];

      cache.get.mockResolvedValue(allAddressCodes);
      mockStringHelper.compareStrings.mockImplementation((str1, str2) => str1 === str2);
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

      const result = await cache.findAddressCode({ city: 'Sirnak', district: 'Merkez' });
      expect(result).toEqual(allAddressCodes[0]);
    });

    it('should pick deterministic best match when multiple candidates exist', async () => {
      const allAddressCodes = [
        {
          CityCode: '7301',
          CityDescription: 'Sirnak',
          DistrictCode: '730102',
          DistrictDescription: 'Merkez ilcesi',
        },
        {
          CityCode: '7301',
          CityDescription: 'Sirnak',
          DistrictCode: '730101',
          DistrictDescription: 'Merkez',
        },
      ];

      cache.get.mockResolvedValue(allAddressCodes);
      mockStringHelper.compareStrings.mockImplementation((str1, str2) => str1 === str2);
      mockStringHelper.normalizeString.mockImplementation(normalizeStringMock);

      const result = await cache.findAddressCode({ city: 'Sirnak', district: 'Merkez' });
      expect(result).toEqual(allAddressCodes[1]);
    });
  });
});

