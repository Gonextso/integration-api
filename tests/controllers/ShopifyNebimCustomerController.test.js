import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import HttpStatusCodes from '../../enums/HttpStatusCodes.js';

const mockCustomerBusiness = {
  updateConsent: jest.fn(),
};

const mockCustomerBusinessClass = jest.fn().mockImplementation(() => mockCustomerBusiness);
const mockConsentSyncBusiness = {
  sync: jest.fn(),
};

const mockCoreController = {
  response: jest.fn(),
};

await jest.unstable_mockModule('../../business/nebim/CustomerBusiness.js', () => ({
  default: mockCustomerBusinessClass,
}));

await jest.unstable_mockModule('../../business/CustomerConsentSyncBusiness.js', () => ({
  default: jest.fn().mockImplementation(() => mockConsentSyncBusiness),
}));

await jest.unstable_mockModule('../../core/CoreControler.js', () => ({
  default: jest.fn().mockImplementation(() => mockCoreController),
}));

const { default: ShopifyNebimCustomerController } = await import('../../controllers/ShopifyNebimCustomerController.js');

describe('ShopifyNebimCustomerController', () => {
  let mockReq;
  let mockRes;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
    };

    mockReq = {
      tenant: mockTenant,
      params: {
        communitaionType: 'email',
      },
      body: {
        email: 'test@example.com',
        phone: '5551234567',
        consents: {
          email: { date: '2024-01-01T10:00:00Z', is_opt_in: true },
          gsm: { date: '2024-01-01T10:00:00Z', is_opt_in: false },
        },
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
    it('should update consent and return success', async () => {
      mockCustomerBusiness.updateConsent.mockResolvedValue({ CustomerCode: 'CUST001' });

      await ShopifyNebimCustomerController.updateConsent(mockReq, mockRes);

      expect(mockCustomerBusinessClass).toHaveBeenCalledWith(mockTenant);
      expect(mockCustomerBusiness.updateConsent).toHaveBeenCalledWith(mockReq.body, 'email', {
        sourceEventId: null,
        sourcePayloadRaw: mockReq.body,
      });
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.SUCCESS,
        content: { CustomerCode: 'CUST001' },
      });
    });

    it('should return bad request for invalid communication type', async () => {
      mockReq.params.communitaionType = 'fax';

      await ShopifyNebimCustomerController.updateConsent(mockReq, mockRes);

      expect(mockCustomerBusiness.updateConsent).not.toHaveBeenCalled();
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'communitaionType must be email or gsm',
      });
    });

    it('should return bad request when email and phone are missing', async () => {
      mockReq.body = {};

      await ShopifyNebimCustomerController.updateConsent(mockReq, mockRes);

      expect(mockCustomerBusiness.updateConsent).not.toHaveBeenCalled();
      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'email or phone is required',
      });
    });

    it('should return bad request when consent date is missing', async () => {
      mockCustomerBusiness.updateConsent.mockResolvedValue({ skipped: true, reason: 'missing_consent_date' });

      await ShopifyNebimCustomerController.updateConsent(mockReq, mockRes);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.BAD_REQUEST,
        info: 'missing_consent_date',
        content: { skipped: true, reason: 'missing_consent_date' },
      });
    });

    it('should return not found when customer does not exist in Nebim', async () => {
      mockCustomerBusiness.updateConsent.mockResolvedValue(null);

      await ShopifyNebimCustomerController.updateConsent(mockReq, mockRes);

      expect(mockCoreController.response).toHaveBeenCalledWith(mockRes, {
        status: HttpStatusCodes.NOT_FOUND,
        info: 'Customer not found in Nebim',
      });
    });
  });
});
