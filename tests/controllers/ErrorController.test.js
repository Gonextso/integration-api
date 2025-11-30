import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';
import ClientError from '../../models/error/ClientError.js';

// Mock dependencies before imports
const mockCoreController = {
  response: jest.fn(),
};

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: jest.fn().mockImplementation(() => mockCoreController),
}));

const { default: ErrorController } = await import('../../controllers/ErrorController.js');

describe('ErrorController', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      url: '/test-url',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
    mockCoreController.response.mockReturnValue(mockRes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('notFound', () => {
    it('should return 404 error with URL', async () => {
      await ErrorController.notFound(mockReq, mockRes);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.NOT_FOUND,
        info: `Requested url: ${mockReq.url} not found`,
      });
    });
  });

  describe('clientErrorHandler', () => {
    it('should handle ClientError and return 400', async () => {
      const error = new ClientError('Client error message');

      await ErrorController.clientErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'Client error message',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next for non-ClientError errors', async () => {
      const error = new Error('Regular error');

      await ErrorController.clientErrorHandler(error, mockReq, mockRes, mockNext);

      expect(mockCoreController.response).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('internalServerError', () => {
    it('should return 500 error with error object', async () => {
      const error = new Error('Internal server error');

      await ErrorController.internalServerError(error, mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.SERVER_ERROR,
        error,
      });
    });
  });
});

