import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockLogHelper = {
  info: jest.fn(),
  info2: jest.fn(),
  error: jest.fn(),
};

const mockLogHelperClass = jest.fn().mockImplementation(() => mockLogHelper);

const mockCLSHelper = {
  get: jest.fn(),
};

const mockWebRequestHelper = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

const mockWebRequestHelperClass = jest.fn().mockImplementation(() => mockWebRequestHelper);

await jest.unstable_mockModule('../../helpers/LogHelper.js', () => ({
  default: mockLogHelperClass,
}));

await jest.unstable_mockModule('../../helpers/CLSHelper.js', () => ({
  default: mockCLSHelper,
}));

await jest.unstable_mockModule('../../helpers/WebRequestHelper.js', () => ({
  default: mockWebRequestHelperClass,
}));

const { default: CoreAPI } = await import('../../core/CoreAPI.js');

describe('CoreAPI', () => {
  let coreAPI;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    mockCLSHelper.get.mockReturnValue('test-trace-id');
    jest.clearAllMocks();
    coreAPI = new CoreAPI(mockTenant);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with tenant', () => {
      expect(coreAPI.tenant).toEqual(mockTenant);
      expect(coreAPI.logger).toBeDefined();
      expect(coreAPI.traceId).toBe('test-trace-id');
    });

    it('should initialize httpRequest with tenant', () => {
      expect(mockWebRequestHelperClass).toHaveBeenCalledWith(mockTenant);
      expect(coreAPI.httpRequest).toBeDefined();
    });

    it('should have httpRequest property', () => {
      expect(coreAPI.httpRequest).toBe(mockWebRequestHelper);
    });
  });
});

