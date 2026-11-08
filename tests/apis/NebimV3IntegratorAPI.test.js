import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';

// Mock dependencies before imports
const mockCache = {
  set: jest.fn(),
  get: jest.fn(),
};

const mockNebimCache = jest.fn().mockImplementation(() => mockCache);

const mockCryptoHelper = {
  decrypt: jest.fn(),
};

const mockCoreAPI = jest.fn().mockImplementation(() => ({
  httpRequest: {
    post: jest.fn(),
    get: jest.fn(),
  },
  logger: {
    info2: jest.fn(),
  },
  throws: jest.fn((message) => {
    throw new Error(message);
  }),
}));

await jest.unstable_mockModule('../../cache/NebimCache.js', () => ({
  default: mockNebimCache,
}));

await jest.unstable_mockModule('../../helpers/CryptoHelper.js', () => ({
  default: mockCryptoHelper,
}));

await jest.unstable_mockModule('../../core/CoreAPI.js', () => ({
  default: mockCoreAPI,
}));

const { default: NebimV3IntegratorAPI } = await import('../../apis/NebimV3IntegratorAPI.js');
const { default: CryptoHelper } = await import('../../helpers/CryptoHelper.js');

describe('NebimV3IntegratorAPI', () => {
  let api;
  let mockTenant;
  let mockHttpRequest;

  beforeEach(() => {
    mockTenant = {
      nebim: {
        host: 'https://test.nebim.com',
        userGroup: 'testUserGroup',
        user: 'testUser',
        password: 'encryptedPassword',
      },
    };

    mockHttpRequest = {
      post: jest.fn(),
      get: jest.fn(),
    };

    jest.clearAllMocks();
    // Reset mock functions
    mockCache.set.mockClear();
    mockCache.get.mockClear();
    mockCryptoHelper.decrypt.mockClear();
    
    api = new NebimV3IntegratorAPI(mockTenant);
    api.tenant = mockTenant;
    api.httpRequest = mockHttpRequest;
    api.logger = { info2: jest.fn() };
    api.cache = mockCache;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConnection', () => {
    it('should return error message when host is missing', async () => {
      const result = await api.checkConnection({
        userGroup: 'test',
        user: 'test',
        password: 'test',
      });

      expect(result).toBe('Host, UserGroup, User and Password are required to connect to Nebim V3 Integrator');
    });

    it('should return error message when userGroup is missing', async () => {
      const result = await api.checkConnection({
        host: 'https://test.com',
        user: 'test',
        password: 'test',
      });

      expect(result).toBe('Host, UserGroup, User and Password are required to connect to Nebim V3 Integrator');
    });

    it('should return error message when user is missing', async () => {
      const result = await api.checkConnection({
        host: 'https://test.com',
        userGroup: 'test',
        password: 'test',
      });

      expect(result).toBe('Host, UserGroup, User and Password are required to connect to Nebim V3 Integrator');
    });

    it('should return error message when password is missing', async () => {
      const result = await api.checkConnection({
        host: 'https://test.com',
        userGroup: 'test',
        user: 'test',
      });

      expect(result).toBe('Host, UserGroup, User and Password are required to connect to Nebim V3 Integrator');
    });

    it('should return error message when httpRequest returns an error', async () => {
      const error = new Error('Network error');
      mockHttpRequest.post.mockResolvedValue(error);

      const result = await api.checkConnection({
        host: 'https://test.com',
        userGroup: 'test',
        user: 'test',
        password: 'test',
      });

      expect(result).toBe('Network error');
    });

    it('should return exception message when response contains exception', async () => {
      mockHttpRequest.post.mockResolvedValue({
        data: {
          Exception: 'Invalid credentials',
        },
      });

      const result = await api.checkConnection({
        host: 'https://test.com',
        userGroup: 'test',
        user: 'test',
        password: 'test',
      });

      expect(result).toBe('Invalid credentials');
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should successfully connect and cache token', async () => {
      const mockToken = 'test-token-123';
      mockHttpRequest.post.mockResolvedValue({
        data: {
          Token: mockToken,
        },
      });

      const result = await api.checkConnection({
        host: 'https://test.com',
        userGroup: 'test',
        user: 'test',
        password: 'test',
      });

      expect(result).toBe('');
      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.com/IntegratorService/Connect',
        {
          UserGroupCode: 'test',
          UserName: 'test',
          Password: 'test',
          Validate: true,
        }
      );
      expect(mockCache.set).toHaveBeenCalledWith('Token', expect.objectContaining({
        token: mockToken,
        expiryDate: expect.any(Date),
      }));
    });

    it('should throw error when token is missing in response', async () => {
      mockHttpRequest.post.mockResolvedValue({
        data: {},
      });

      await expect(api.checkConnection({
        host: 'https://test.com',
        userGroup: 'test',
        user: 'test',
        password: 'test',
      })).rejects.toThrow('Something went wrong while connecting Nebim V3 Integrator');
    });
  });

  describe('connectionProvider', () => {
    it('should use cached token when available and not expired', async () => {
      const mockToken = 'cached-token';
      const futureDate = new Date(Date.now() + 10000);
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: futureDate,
      });

      const mockExec = jest.fn().mockResolvedValue({ StatusCode: 200 });
      const result = await api.connectionProvider(mockExec);

      expect(mockCache.get).toHaveBeenCalledWith('Token');
      expect(mockHttpRequest.post).not.toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith({
        Token: mockToken,
        'Content-Type': 'application/json',
      });
      expect(result).toEqual({ StatusCode: 200 });
    });

    it('should fetch new token when cache is empty', async () => {
      const mockToken = 'new-token';
      mockCache.get.mockResolvedValue(null);
      mockHttpRequest.post.mockResolvedValue({
        data: {
          Token: mockToken,
        },
      });
      mockCryptoHelper.decrypt.mockReturnValue('decryptedPassword');

      const mockExec = jest.fn().mockResolvedValue({ StatusCode: 200 });
      const result = await api.connectionProvider(mockExec);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/Connect',
        {
          UserGroupCode: 'testUserGroup',
          UserName: 'testUser',
          Password: 'decryptedPassword',
          Validate: true,
        }
      );
      expect(mockCache.set).toHaveBeenCalledWith('Token', expect.objectContaining({
        token: mockToken,
        expiryDate: expect.any(Date),
      }));
      expect(result).toEqual({ StatusCode: 200 });
    });

    it('should fetch new token when cached token is expired', async () => {
      const pastDate = new Date(Date.now() - 10000);
      mockCache.get.mockResolvedValue({
        token: 'expired-token',
        expiryDate: pastDate,
      });

      const mockToken = 'new-token';
      mockHttpRequest.post.mockResolvedValue({
        data: {
          Token: mockToken,
        },
      });
      mockCryptoHelper.decrypt.mockReturnValue('decryptedPassword');

      const mockExec = jest.fn().mockResolvedValue({ StatusCode: 200 });
      await api.connectionProvider(mockExec);

      expect(mockHttpRequest.post).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should throw error when response contains exception', async () => {
      mockCache.get.mockResolvedValue(null);
      mockHttpRequest.post.mockResolvedValue({
        data: {
          Exception: 'Connection failed',
        },
      });
      mockCryptoHelper.decrypt.mockReturnValue('decryptedPassword');

      const mockExec = jest.fn();
      await expect(api.connectionProvider(mockExec)).rejects.toThrow('Connection failed');
    });

    it('should throw error when token is missing in response', async () => {
      mockCache.get.mockResolvedValue(null);
      mockHttpRequest.post.mockResolvedValue({
        data: {},
      });
      mockCryptoHelper.decrypt.mockReturnValue('decryptedPassword');

      const mockExec = jest.fn();
      await expect(api.connectionProvider(mockExec)).rejects.toThrow('Something went wrong while connecting Nebim V3 Integrator');
    });

    it('should use custom host when provided', async () => {
      mockCache.get.mockResolvedValue(null);
      const customHost = 'https://custom.nebim.com';
      mockHttpRequest.post.mockResolvedValue({
        data: {
          Token: 'token',
        },
      });
      mockCryptoHelper.decrypt.mockReturnValue('decryptedPassword');

      const mockExec = jest.fn().mockResolvedValue({ StatusCode: 200 });
      await api.connectionProvider(mockExec, customHost);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        `${customHost}/IntegratorService/Connect`,
        expect.any(Object)
      );
    });

    it('should throw error when StatusCode indicates error', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const mockExec = jest.fn().mockResolvedValue({
        StatusCode: HttpStatusCodes.BAD_REQUEST.code,
        ExceptionMessage: 'Bad request error',
      });

      await expect(api.connectionProvider(mockExec)).rejects.toThrow('Bad request error');
    });

    it('should throw original error when exec returns Error object', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const mockExec = jest.fn().mockResolvedValue(new Error('Nebim timeout'));

      await expect(api.connectionProvider(mockExec)).rejects.toThrow('Nebim timeout');
    });
  });

  describe('runProc', () => {
    it('should call RunProc endpoint with correct parameters', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const procName = 'TestProc';
      const parameters = { param1: 'value1', param2: 'value2' };
      mockHttpRequest.post.mockResolvedValue({
        data: { result: 'success' },
      });

      const result = await api.runProc(procName, parameters);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/RunProc',
        {
          ProcName: procName,
          ...parameters,
        },
        {
          headers: {
            Token: mockToken,
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ result: 'success' });
    });

    it('should convert null parameters to empty strings', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });
      mockHttpRequest.post.mockResolvedValue({
        data: { result: 'success' },
      });

      await api.runProc('sp_GO_GetProductInventory', {
        Date: '2026-08-19T13:55:00.000Z',
        BarcodeTypeCode: '1',
        OrderStoreCode: null,
        ResponsibiltyAreaCode: 'WEB',
        IncludeBlocked: false,
      });

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/RunProc',
        {
          ProcName: 'sp_GO_GetProductInventory',
          Date: '2026-08-19T13:55:00.000Z',
          BarcodeTypeCode: '1',
          OrderStoreCode: '',
          ResponsibiltyAreaCode: 'WEB',
          IncludeBlocked: false,
        },
        expect.any(Object)
      );
    });
  });

  describe('runProcReturnSingle', () => {
    it('should call RunProcReturnSingle endpoint with correct parameters', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const procName = 'TestProc';
      const parameters = { param1: 'value1' };
      mockHttpRequest.post.mockResolvedValue({
        data: { result: 'single' },
      });

      const result = await api.runProcReturnSingle(procName, parameters);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/RunProcReturnSingle',
        {
          ProcName: procName,
          ...parameters,
        },
        {
          headers: {
            Token: mockToken,
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ result: 'single' });
    });

    it('should convert null parameters to empty strings', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });
      mockHttpRequest.post.mockResolvedValue({
        data: { result: 'single' },
      });

      await api.runProcReturnSingle('TestProc', {
        OptionalCode: null,
        Count: 0,
      });

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/RunProcReturnSingle',
        {
          ProcName: 'TestProc',
          OptionalCode: '',
          Count: 0,
        },
        expect.any(Object)
      );
    });

    it('should return empty object when data is null', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      mockHttpRequest.post.mockResolvedValue({
        data: null,
      });

      const result = await api.runProcReturnSingle('TestProc', {});

      expect(result).toEqual({});
    });
  });

  describe('getModel', () => {
    it('should get customer model with correct parameters', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const customerCode = 'CUST001';
      mockHttpRequest.post.mockResolvedValue({
        data: { customer: 'data' },
      });

      const result = await api.getModel('customer', customerCode);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/GetModel',
        {
          ModelType: 3,
          CurrAccCode: customerCode,
        },
        {
          headers: {
            Token: mockToken,
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ customer: 'data' });
    });

    it('should use default ModelType for unknown type', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      mockHttpRequest.post.mockResolvedValue({
        data: { model: 'data' },
      });

      const result = await api.getModel('unknown', 'key');

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/GetModel',
        {
          ModelType: 0,
        },
        expect.any(Object)
      );
      expect(result).toEqual({ model: 'data' });
    });
  });

  describe('post', () => {
    it('should post data with default headers', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const postData = { field: 'value' };
      mockHttpRequest.post.mockResolvedValue({
        data: { result: 'posted' },
      });

      const result = await api.post(postData);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/Post',
        postData,
        {
          headers: {
            Token: mockToken,
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ result: 'posted' });
    });

    it('should merge custom headers with default headers', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const postData = { field: 'value' };
      const customHeaders = { 'X-Custom-Header': 'custom-value' };
      mockHttpRequest.post.mockResolvedValue({
        data: { result: 'posted' },
      });

      await api.post(postData, customHeaders);

      expect(mockHttpRequest.post).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/Post',
        postData,
        {
          headers: {
            'X-Custom-Header': 'custom-value',
            Token: mockToken,
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });

  describe('getUserInfo', () => {
    it('should get user info with default host', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      mockHttpRequest.get.mockResolvedValue({
        data: { user: 'info' },
      });

      const result = await api.getUserInfo();

      expect(api.logger.info2).toHaveBeenCalledWith(
        `Getting user info from Nebim V3 Integrator from https://test.nebim.com`
      );
      expect(mockHttpRequest.get).toHaveBeenCalledWith(
        'https://test.nebim.com/IntegratorService/GetUserInfo',
        {
          headers: {
            Token: mockToken,
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual({ user: 'info' });
    });

    it('should get user info with custom host', async () => {
      const mockToken = 'token';
      mockCache.get.mockResolvedValue({
        token: mockToken,
        expiryDate: new Date(Date.now() + 10000),
      });

      const customHost = 'https://custom.nebim.com';
      mockHttpRequest.get.mockResolvedValue({
        data: { user: 'info' },
      });

      const result = await api.getUserInfo(customHost);

      expect(api.logger.info2).toHaveBeenCalledWith(
        `Getting user info from Nebim V3 Integrator from ${customHost}`
      );
      expect(mockHttpRequest.get).toHaveBeenCalledWith(
        `${customHost}/IntegratorService/GetUserInfo`,
        expect.any(Object)
      );
      expect(result).toEqual({ user: 'info' });
    });
  });
});
