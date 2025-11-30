import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';
import { DateTime } from 'luxon';

// Mock dependencies before imports
const mockCoreController = {
  response: jest.fn(),
};

const mockCoreControllerClass = jest.fn().mockImplementation(() => mockCoreController);

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: mockCoreControllerClass,
}));

const { default: ValidatorMiddleware } = await import('../../middlewares/ValidatorMiddleware.js');

describe('ValidatorMiddleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      query: {},
      body: {},
    };
    mockRes = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDatesFromQuery', () => {
    it('should parse ISO date strings and set in request', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockReq.startDate).toBeDefined();
      expect(mockReq.endDate).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should parse ISO datetime strings with timezone', async () => {
      mockReq.query = {
        startDate: '2024-01-01T10:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockReq.startDate).toBeDefined();
      expect(mockReq.endDate).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should parse epoch milliseconds', async () => {
      const startEpoch = DateTime.fromISO('2024-01-01').toMillis();
      const endEpoch = DateTime.fromISO('2024-01-31').toMillis();

      mockReq.query = {
        startDate: startEpoch.toString(),
        endDate: endEpoch.toString(),
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockReq.startDate).toBeDefined();
      expect(mockReq.endDate).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use current date as endDate when not provided', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockReq.startDate).toBeDefined();
      expect(mockReq.endDate).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when startDate is missing', async () => {
      mockReq.query = {};

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: "'startDate' not provided",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when startDate is after endDate', async () => {
      mockReq.query = {
        startDate: '2024-01-31',
        endDate: '2024-01-01',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: "'startDate' cannot be after 'endDate'.",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when startDate format is invalid', async () => {
      mockReq.query = {
        startDate: 'invalid-date',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: expect.stringContaining('Invalid startDate'),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when endDate format is invalid', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: 'invalid-date',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: expect.stringContaining('Invalid endDate'),
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set dates as ISO strings', async () => {
      mockReq.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      await ValidatorMiddleware.validateDatesFromQuery(mockReq, mockRes, mockNext);

      expect(mockReq.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(mockReq.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('isRequestBodyExists', () => {
    it('should call next when request body exists', async () => {
      mockReq.body = { key: 'value' };

      await ValidatorMiddleware.isRequestBodyExists(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockCoreController.response).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when request body is missing', async () => {
      mockReq.body = null;

      await ValidatorMiddleware.isRequestBodyExists(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'Request body is missing',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST when request body is undefined', async () => {
      mockReq.body = undefined;

      await ValidatorMiddleware.isRequestBodyExists(mockReq, mockRes, mockNext);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'Request body is missing',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept empty object as valid body', async () => {
      mockReq.body = {};

      await ValidatorMiddleware.isRequestBodyExists(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockCoreController.response).not.toHaveBeenCalled();
    });
  });
});

