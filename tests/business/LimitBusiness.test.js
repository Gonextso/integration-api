import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockSuccessOrder = {
  count: jest.fn(),
};

const mockSyncedBarcode = {
  count: jest.fn(),
};

const mockTenantModel = {
  findById: jest.fn(),
  updateOne: jest.fn(),
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

await jest.unstable_mockModule('../../models/db/postgres/SuccessOrder.js', () => ({
  default: mockSuccessOrder,
}));

await jest.unstable_mockModule('../../models/db/postgres/SyncedBarcode.js', () => ({
  default: mockSyncedBarcode,
}));

await jest.unstable_mockModule('../../models/db/postgres/Tenant.js', () => ({
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
      id: 'test-tenant-id',
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
    };

    jest.clearAllMocks();
    mockTenantModel.findById.mockResolvedValue(mockTenant);
    mockTenantModel.updateOne.mockResolvedValue(mockTenant);
    business = new LimitBusiness(mockTenant);
    business.tenant = mockTenant;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUsage', () => {
    it('should derive product_details usage from SyncedBarcode count', async () => {
      mockSyncedBarcode.count.mockResolvedValue(42);

      const used = await business.getUsage('product_details');

      expect(used).toBe(42);
      expect(mockSyncedBarcode.count).toHaveBeenCalledWith({ tenant: mockTenant.id });
      expect(mockSuccessOrder.count).not.toHaveBeenCalled();
    });

    it('should derive order usage from non-cancelled SuccessOrders in the last month', async () => {
      mockSuccessOrder.count.mockResolvedValue(7);

      const used = await business.getUsage('order');

      expect(used).toBe(7);
      expect(mockSuccessOrder.count).toHaveBeenCalledWith({
        tenant: mockTenant.id,
        isCancelled: false,
        createdAt: { $gte: expect.any(Date) },
      });

      const { createdAt } = mockSuccessOrder.count.mock.calls[0][0];
      const expected = new Date();
      expected.setMonth(expected.getMonth() - 1);
      expect(Math.abs(createdAt.$gte.getTime() - expected.getTime())).toBeLessThan(5000);
      expect(mockSyncedBarcode.count).not.toHaveBeenCalled();
    });

    it('should handle uppercase limit type', async () => {
      mockSyncedBarcode.count.mockResolvedValue(3);

      const used = await business.getUsage('PRODUCT_DETAILS');

      expect(used).toBe(3);
      expect(mockSyncedBarcode.count).toHaveBeenCalledWith({ tenant: mockTenant.id });
    });
  });

  describe('getRemaining', () => {
    it('should return limit, derived usage and remaining', async () => {
      mockSuccessOrder.count.mockResolvedValue(30);

      const result = await business.getRemaining('order');

      expect(mockTenantModel.findById).toHaveBeenCalledWith(mockTenant.id);
      expect(result).toEqual({ limit: 100, used: 30, remaining: 70, isUnlimited: false });
    });

    it('should not return negative remaining', async () => {
      mockSuccessOrder.count.mockResolvedValue(150);

      const result = await business.getRemaining('order');

      expect(result.remaining).toBe(0);
    });

    it('should report unlimited for ENTERPRISE plan', async () => {
      mockTenant.shopify.billing.planKey = SystemCodes.BILLING_PLANS.ENTERPRISE.KEY;
      mockSyncedBarcode.count.mockResolvedValue(3000);

      const result = await business.getRemaining('product_details');

      expect(result.isUnlimited).toBe(true);
      expect(result.remaining).toBe(Infinity);
      expect(result.used).toBe(3000);
    });
  });

  describe('checkLimitAvailability', () => {
    it('should pass when limit is available', async () => {
      mockSuccessOrder.count.mockResolvedValue(50);

      await business.checkLimitAvailability('order', 10);

      expect(business.logger.info2).toHaveBeenCalled();
      // Should not throw
    });

    it('should pass exactly at the boundary', async () => {
      mockSuccessOrder.count.mockResolvedValue(90);

      await business.checkLimitAvailability('order', 10); // 90 + 10 == 100
    });

    it('should throw error when limit is exceeded for BASIC plan', async () => {
      mockSuccessOrder.count.mockResolvedValue(95);

      await expect(business.checkLimitAvailability('order', 10)).rejects.toThrow('Limit exceed');
    });

    it('should not throw error when limit is exceeded for ENTERPRISE plan', async () => {
      mockTenant.shopify.billing.planKey = SystemCodes.BILLING_PLANS.ENTERPRISE.KEY;
      mockSuccessOrder.count.mockResolvedValue(1000);

      await business.checkLimitAvailability('order', 10);

      // Should not throw for ENTERPRISE plan
      expect(business.logger.info2).toHaveBeenCalled();
    });

    it('should check product_details against SyncedBarcode count', async () => {
      mockSyncedBarcode.count.mockResolvedValue(499);

      await expect(business.checkLimitAvailability('product_details', 2)).rejects.toThrow('Limit exceed');
      expect(mockSyncedBarcode.count).toHaveBeenCalledWith({ tenant: mockTenant.id });
    });

    it('should handle uppercase limit type', async () => {
      mockSyncedBarcode.count.mockResolvedValue(0);

      await business.checkLimitAvailability('PRODUCT_DETAILS', 10);

      expect(business.logger.info2).toHaveBeenCalled();
    });
  });

  describe('syncUsageSnapshot', () => {
    it('should write derived usage to pricing as an idempotent set', async () => {
      mockSyncedBarcode.count.mockResolvedValue(42);

      const written = await business.syncUsageSnapshot('product_details');

      expect(written).toBe(42);
      expect(mockTenantModel.updateOne).toHaveBeenCalledWith(
        { id: mockTenant.id },
        {
          'shopify.billing.limits': {
            product_details: {
              used: 42,
            },
          },
        }
      );
    });

    it('should write order usage under the order key', async () => {
      mockSuccessOrder.count.mockResolvedValue(5);

      const written = await business.syncUsageSnapshot('ORDER');

      expect(written).toBe(5);
      expect(mockTenantModel.updateOne).toHaveBeenCalledWith(
        { id: mockTenant.id },
        {
          'shopify.billing.limits': {
            order: {
              used: 5,
            },
          },
        }
      );
    });

    it('should swallow errors and never throw', async () => {
      mockSyncedBarcode.count.mockRejectedValue(new Error('db down'));

      const written = await business.syncUsageSnapshot('product_details');

      expect(written).toBeNull();
      expect(business.logger.error).toHaveBeenCalled();
      expect(mockTenantModel.updateOne).not.toHaveBeenCalled();
    });
  });
});
