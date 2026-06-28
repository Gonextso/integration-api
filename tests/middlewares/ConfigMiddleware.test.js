import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';

const tenantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockTenant = {
  id: tenantId,
  name: 'test-tenant',
  shopify: {
    apiKey: {
      encryptedData: 'encrypted-data',
      iv: 'iv-value',
      authTag: 'auth-tag',
    },
    billing: { isBlocked: false },
  },
  nebim: {
    password: {
      encryptedData: 'encrypted-password',
      iv: 'iv-value',
      authTag: 'auth-tag',
    },
  },
};

const mockTenantModel = {
  findById: jest.fn().mockResolvedValue(mockTenant),
};

const mockCryptoHelper = {
  decrypt: jest.fn().mockReturnValue('decrypted-api-key'),
};

const mockCoreController = {
  response: jest.fn(),
};

const mockCoreControllerClass = jest.fn().mockImplementation(() => mockCoreController);

await jest.unstable_mockModule('../../models/db/postgres/Tenant.js', () => ({
  default: mockTenantModel,
}));

await jest.unstable_mockModule('../../helpers/CryptoHelper.js', () => ({
  default: mockCryptoHelper,
}));

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: mockCoreControllerClass,
}));

const { default: ConfigMiddleware } = await import('../../middlewares/ConfigMiddleware.js');

describe('ConfigMiddleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      get: jest.fn(),
    };
    mockRes = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
    mockTenantModel.findById.mockResolvedValue(mockTenant);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setConfigViaTenantId', () => {
    it('should set tenant config when valid tenant ID is provided', async () => {
      mockReq.headers['x-tenant-id'] = tenantId;

      await ConfigMiddleware.setConfigViaTenantId(mockReq, mockRes, mockNext);

      expect(mockTenantModel.findById).toHaveBeenCalledWith(tenantId);
      expect(mockCryptoHelper.decrypt).toHaveBeenCalledWith(mockTenant.shopify.apiKey);
      expect(mockReq.tenant).toBeDefined();
      expect(mockReq.tenant.shopify.decyrptedApiKey).toBe('decrypted-api-key');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use req.get when header is not in headers object', async () => {
      mockReq.get.mockReturnValue(tenantId);

      await ConfigMiddleware.setConfigViaTenantId(mockReq, mockRes, mockNext);

      expect(mockReq.get).toHaveBeenCalledWith('x-tenant-id');
      expect(mockTenantModel.findById).toHaveBeenCalledWith(tenantId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when tenant ID is missing', async () => {
      await ConfigMiddleware.setConfigViaTenantId(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: "'x-tenant-id' header is required.",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when tenant ID is invalid UUID', async () => {
      mockReq.headers['x-tenant-id'] = 'invalid-id';

      await ConfigMiddleware.setConfigViaTenantId(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'Invalid UUID format.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND when tenant is not found', async () => {
      mockReq.headers['x-tenant-id'] = tenantId;
      mockTenantModel.findById.mockResolvedValue(null);

      await ConfigMiddleware.setConfigViaTenantId(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.NOT_FOUND,
        info: 'Tenant not found.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return FORBIDDEN when tenant is blocked', async () => {
      mockReq.headers['x-tenant-id'] = tenantId;

      mockTenantModel.findById.mockResolvedValue({
        ...mockTenant,
        shopify: {
          ...mockTenant.shopify,
          billing: { isBlocked: true },
        },
      });

      await ConfigMiddleware.setConfigViaTenantId(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.FORBIDDEN,
        info: 'Store is blocked. Synchronization is disabled.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
