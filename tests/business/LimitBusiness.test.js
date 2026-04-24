import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockSuccessOrder = {
  find: jest.fn(),
  updateMany: jest.fn(),
};

const mockTenantModel = {
  findById: jest.fn(),
  save: jest.fn(),
};

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    info2: jest.fn(),
    error: jest.fn(),
  },
  throws: jest.fn((message) => {
    throw new Error(message);
  }),
}));

await jest.unstable_mockModule('../../models/db/SuccessOrder.js', () => ({
  default: mockSuccessOrder,
}));

await jest.unstable_mockModule('../../models/db/Tenant.js', () => ({
  default: mockTenantModel,
}));

await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: LimitBusiness } = await import('../../business/LimitBusiness.js');

describe('LimitBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      shopify: {
        billing: {
          planKey: SystemCodes.BILLING_PLANS.BASIC.KEY,
          limits: {
            order: {
              limit: 100,
              used: 50,
            },
            product_details: {
              limit: 500,
              used: 200,
            },
          },
        },
      },
      save: jest.fn(),
    };

    jest.clearAllMocks();
    business = new LimitBusiness(mockTenant);
    business.tenant = mockTenant;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('clearUsage', () => {
    it('should clear expired orders and update tenant limits', async () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const expiredOrders = [
        { _id: 'order1', createdAt: oneMonthAgo },
        { _id: 'order2', createdAt: oneMonthAgo },
      ];

      mockSuccessOrder.find.mockResolvedValue(expiredOrders);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockTenant.save.mockResolvedValue(mockTenant);
      mockSuccessOrder.updateMany.mockResolvedValue({});

      await business.clearUsage('order');

      expect(mockSuccessOrder.find).toHaveBeenCalledWith({
        tenant: mockTenant._id,
        createdAt: { $lte: expect.any(Date) },
        cleared: { $ne: true },
      });
      expect(mockTenant.shopify.billing.limits.order.used).toBe(48); // 50 - 2
      expect(mockTenant.save).toHaveBeenCalled();
      expect(mockSuccessOrder.updateMany).toHaveBeenCalled();
    });

    it('should not update when no expired orders', async () => {
      mockSuccessOrder.find.mockResolvedValue([]);

      await business.clearUsage('order');

      expect(mockTenantModel.findById).not.toHaveBeenCalled();
      expect(mockTenant.save).not.toHaveBeenCalled();
    });

    it('should handle uppercase limit type', async () => {
      const expiredOrders = [{ _id: 'order1' }];

      mockSuccessOrder.find.mockResolvedValue(expiredOrders);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockTenant.save.mockResolvedValue(mockTenant);
      mockSuccessOrder.updateMany.mockResolvedValue({});

      await business.clearUsage('ORDER');

      expect(mockTenant.shopify.billing.limits.order.used).toBe(49);
    });

    it('should not allow negative used limit', async () => {
      mockTenant.shopify.billing.limits.order.used = 1;
      const expiredOrders = [
        { _id: 'order1' },
        { _id: 'order2' },
      ];

      mockSuccessOrder.find.mockResolvedValue(expiredOrders);
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockTenant.save.mockResolvedValue(mockTenant);
      mockSuccessOrder.updateMany.mockResolvedValue({});

      await business.clearUsage('order');

      expect(mockTenant.shopify.billing.limits.order.used).toBe(0); // Math.max(0, 1-2)
    });
  });

  describe('checkLimitAvailability', () => {
    it('should pass when limit is available', async () => {
      mockSuccessOrder.find.mockResolvedValue([]);

      await business.checkLimitAvailability('order', 10);

      expect(business.logger.info2).toHaveBeenCalled();
      // Should not throw
    });

    it('should throw error when limit is exceeded for BASIC plan', async () => {
      mockTenant.shopify.billing.limits.order.used = 95;
      mockSuccessOrder.find.mockResolvedValue([]);

      await expect(business.checkLimitAvailability('order', 10)).rejects.toThrow('Limit exceed');
    });

    it('should not throw error when limit is exceeded for ENTERPRISE plan', async () => {
      mockTenant.shopify.billing.planKey = SystemCodes.BILLING_PLANS.ENTERPRISE.KEY;
      mockTenant.shopify.billing.limits.order.used = 1000;
      mockSuccessOrder.find.mockResolvedValue([]);

      await business.checkLimitAvailability('order', 10);

      // Should not throw for ENTERPRISE plan
      expect(business.logger.info2).toHaveBeenCalled();
    });

    it('should clear usage before checking limit', async () => {
      mockSuccessOrder.find.mockResolvedValue([]);

      await business.checkLimitAvailability('order', 10);

      expect(mockSuccessOrder.find).toHaveBeenCalled();
    });

    it('should handle uppercase limit type', async () => {
      mockSuccessOrder.find.mockResolvedValue([]);

      await business.checkLimitAvailability('PRODUCT_DETAILS', 10);

      expect(business.logger.info2).toHaveBeenCalled();
    });
  });

  describe('useLimit', () => {
    it('should increment used limit', async () => {
      const initialUsed = mockTenant.shopify.billing.limits.order.used;
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockTenant.save.mockResolvedValue(mockTenant);

      await business.useLimit('order', 5);

      expect(mockTenant.shopify.billing.limits.order.used).toBe(initialUsed + 5);
      expect(mockTenant.save).toHaveBeenCalled();
    });

    it('should handle uppercase limit type', async () => {
      const initialUsed = mockTenant.shopify.billing.limits.product_details.used;
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockTenant.save.mockResolvedValue(mockTenant);

      await business.useLimit('PRODUCT_DETAILS', 10);

      expect(mockTenant.shopify.billing.limits.product_details.used).toBe(initialUsed + 10);
    });

    it('should save tenant after updating limit', async () => {
      mockTenantModel.findById.mockResolvedValue(mockTenant);
      mockTenant.save.mockResolvedValue(mockTenant);

      await business.useLimit('order', 1);

      expect(mockTenantModel.findById).toHaveBeenCalledWith(mockTenant._id);
      expect(mockTenant.save).toHaveBeenCalled();
    });
  });
});

