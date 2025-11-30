import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

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

await jest.unstable_mockModule('../../core/CoreCache.js', () => ({
  default: mockCoreCache,
}));

const { default: SystemCache } = await import('../../cache/SystemCache.js');

describe('SystemCache', () => {
  let cache;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    jest.clearAllMocks();
    cache = new SystemCache(mockTenant);
    cache.tenant = mockTenant;
    cache.redis = mockRedisAPI;
    cache.logger = {
      info: jest.fn(),
      info2: jest.fn(),
      error: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be an instance of CoreCache', () => {
    expect(cache).toBeDefined();
    expect(cache.tenant).toEqual(mockTenant);
  });

  it('should inherit CoreCache methods', () => {
    expect(cache.set).toBeDefined();
    expect(cache.get).toBeDefined();
    expect(cache.delete).toBeDefined();
    expect(cache.lock).toBeDefined();
    expect(cache.unlock).toBeDefined();
  });
});

