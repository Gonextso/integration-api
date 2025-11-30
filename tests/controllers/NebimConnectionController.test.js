import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';

// Mock dependencies before imports
const mockNebimAPI = {
  checkConnection: jest.fn(),
  getUserInfo: jest.fn(),
};

const mockNebimAPIClass = jest.fn().mockImplementation(() => mockNebimAPI);

const mockCoreController = {
  response: jest.fn(),
};

await jest.unstable_mockModule('../../apis/NebimV3IntegratorAPI.js', () => ({
  default: mockNebimAPIClass,
}));

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: jest.fn().mockImplementation(() => mockCoreController),
}));

const { default: NebimConnectionController } = await import('../../controllers/NebimConnectionController.js');

describe('NebimConnectionController', () => {
  let mockReq;
  let mockRes;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    mockReq = {
      tenant: mockTenant,
      body: {
        host: 'https://test.nebim.com',
        userGroup: 'test',
        user: 'test',
        password: 'test',
      },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
    mockCoreController.response.mockReturnValue(mockRes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should check connection successfully', async () => {
      const userInfo = {
        UserName: 'test',
        UserGroup: 'test',
      };

      mockNebimAPI.checkConnection.mockResolvedValue('');
      mockNebimAPI.getUserInfo.mockResolvedValue(userInfo);

      await NebimConnectionController.check(mockReq, mockRes);

      expect(mockNebimAPIClass).toHaveBeenCalledWith(mockTenant);
      expect(mockNebimAPI.checkConnection).toHaveBeenCalledWith(mockReq.body);
      expect(mockNebimAPI.getUserInfo).toHaveBeenCalledWith(mockReq.body.host);
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.SUCCESS,
        info: 'Connection to Nebim V3 Integrator is successfully created',
        content: userInfo,
      });
    });

    it('should return error when connection check fails', async () => {
      const exception = 'Invalid credentials';

      mockNebimAPI.checkConnection.mockResolvedValue(exception);

      await NebimConnectionController.check(mockReq, mockRes);

      expect(mockNebimAPI.checkConnection).toHaveBeenCalledWith(mockReq.body);
      expect(mockNebimAPI.getUserInfo).not.toHaveBeenCalled();
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: exception,
      });
    });

    it('should return error when request body is missing', async () => {
      mockReq.body = null;

      await NebimConnectionController.check(mockReq, mockRes);

      expect(mockNebimAPI.checkConnection).not.toHaveBeenCalled();
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'Request body is required',
      });
    });
  });
});

