import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockLogHelper = {
  info: jest.fn(),
  info2: jest.fn(),
  info3: jest.fn(),
  info4: jest.fn(),
  error: jest.fn(),
};

const mockLogHelperClass = jest.fn().mockImplementation(() => mockLogHelper);

const mockCLSHelper = {
  get: jest.fn(),
};

const mockStringHelper = {
  generateUUID: jest.fn(),
};

const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  isAxiosError: jest.fn(),
};

const mockRequestLog = {
  save: jest.fn(),
};

const mockRequestLogModel = jest.fn().mockImplementation((data) => ({
  ...data,
  save: jest.fn().mockResolvedValue(undefined),
}));

await jest.unstable_mockModule('../../helpers/LogHelper.js', () => ({
  default: mockLogHelperClass,
}));

await jest.unstable_mockModule('../../helpers/CLSHelper.js', () => ({
  default: mockCLSHelper,
}));

await jest.unstable_mockModule('../../helpers/StringHelper.js', () => ({
  default: mockStringHelper,
}));

await jest.unstable_mockModule('axios', () => ({
  default: mockAxios,
  isAxiosError: mockAxios.isAxiosError,
}));

await jest.unstable_mockModule('../../models/db/RequestLog.js', () => ({
  default: mockRequestLogModel,
}));

const { default: WebRequestHelper } = await import('../../helpers/WebRequestHelper.js');

describe('WebRequestHelper', () => {
  let helper;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    mockCLSHelper.get.mockReturnValue('test-trace-id');
    mockStringHelper.generateUUID.mockReturnValue('test-uuid');
    jest.clearAllMocks();
    helper = new WebRequestHelper(mockTenant);
    helper.logger = mockLogHelper;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should make GET request and log response', async () => {
      const url = 'https://api.example.com/data';
      const response = {
        status: 200,
        data: { result: 'success' },
      };

      mockAxios.get.mockResolvedValue(response);

      const result = await helper.get(url);

      expect(mockStringHelper.generateUUID).toHaveBeenCalled();
      expect(mockAxios.get).toHaveBeenCalledWith(url);
      expect(mockLogHelper.info4).toHaveBeenCalled();
      expect(mockLogHelper.info3).toHaveBeenCalled();
      expect(result).toEqual(response);
    });

    it('should handle GET request with headers', async () => {
      const url = 'https://api.example.com/data';
      const config = {
        headers: {
          Authorization: 'Bearer token123',
        },
      };
      const response = {
        status: 200,
        data: { result: 'success' },
      };

      mockAxios.get.mockResolvedValue(response);

      await helper.get(url, config);

      expect(mockAxios.get).toHaveBeenCalledWith(url, config);
    });
  });

  describe('post', () => {
    it('should make POST request and log response', async () => {
      const url = 'https://api.example.com/data';
      const data = { key: 'value' };
      const response = {
        status: 201,
        data: { result: 'created' },
      };

      mockAxios.post.mockResolvedValue(response);

      const result = await helper.post(url, data);

      expect(mockStringHelper.generateUUID).toHaveBeenCalled();
      expect(mockAxios.post).toHaveBeenCalledWith(url, data);
      expect(mockLogHelper.info4).toHaveBeenCalled();
      expect(mockLogHelper.info3).toHaveBeenCalled();
      expect(result).toEqual(response);
    });
  });

  describe('gpost', () => {
    it('should make POST request with gpost method', async () => {
      const url = 'https://api.example.com/data';
      const data = { key: 'value' };
      const response = {
        status: 201,
        data: { result: 'created' },
      };

      mockAxios.post.mockResolvedValue(response);

      const result = await helper.gpost(url, data);

      expect(mockStringHelper.generateUUID).toHaveBeenCalled();
      expect(mockAxios.post).toHaveBeenCalledWith(url, data);
      expect(mockLogHelper.info4).toHaveBeenCalled();
      expect(mockLogHelper.info3).toHaveBeenCalled();
      expect(result).toEqual(response);
    });
  });

  describe('error handling', () => {
    it('should handle axios errors', async () => {
      const url = 'https://api.example.com/data';
      const error = {
        status: 500,
        data: { error: 'Internal Server Error' },
      };

      mockAxios.get.mockRejectedValue(error);
      mockAxios.isAxiosError.mockReturnValue(true);

      const result = await helper.get(url);

      expect(result).toEqual(error);
      // info3 is called for response time logging, but only if there's a result.status
      // For errors, it may not be called
    });

    it('should handle non-axios errors', async () => {
      const url = 'https://api.example.com/data';
      const error = new Error('Network error');

      mockAxios.get.mockRejectedValue(error);
      mockAxios.isAxiosError.mockReturnValue(false);

      // WebRequestHelper catches errors and returns them, doesn't throw
      const result = await helper.get(url);
      expect(result).toEqual(error);
    });
  });

  describe('request logging', () => {
    it('should create RequestLog for successful request', async () => {
      const url = 'https://api.example.com/data';
      const response = {
        status: 200,
        data: { result: 'success' },
      };

      mockAxios.get.mockResolvedValue(response);

      await helper.get(url);

      expect(mockRequestLogModel).toHaveBeenCalled();
      const logData = mockRequestLogModel.mock.calls[0][0];
      expect(logData.tenant).toBe(mockTenant._id);
      expect(logData.url).toBe(url);
    });

    it('should mask tokens in headers', async () => {
      const url = 'https://api.example.com/data';
      const config = {
        headers: {
          Authorization: 'Bearer secret-token',
          'X-Api-Token': 'api-token-123',
        },
      };
      const response = {
        status: 200,
        data: { result: 'success' },
      };

      mockAxios.get.mockResolvedValue(response);

      await helper.get(url, config);

      expect(mockLogHelper.info4).toHaveBeenCalled();
      const logCall = mockLogHelper.info4.mock.calls[0][0];
      expect(logCall).toContain('masked_by_gonextso');
    });
  });
});

