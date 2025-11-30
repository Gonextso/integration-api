import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';

// Mock dependencies before imports
const mockCoreController = {
  response: jest.fn(),
};

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: jest.fn().mockImplementation(() => mockCoreController),
}));

const { default: ShopifyNebimCustomerController } = await import('../../controllers/ShopifyNebimCustomerController.js');

describe('ShopifyNebimCustomerController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      params: {
        communitaionType: 'email',
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

  describe('updateConsent', () => {
    it('should return success with params', async () => {
      await ShopifyNebimCustomerController.updateConsent(mockReq, mockRes);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.SUCCESS,
        content: mockReq.params,
      });
    });
  });
});

