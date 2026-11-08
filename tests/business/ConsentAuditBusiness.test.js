import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLog = {
  createPending: jest.fn(),
  complete: jest.fn(),
};

await jest.unstable_mockModule('../../models/db/postgres/CustomerConsentTransferLog.js', () => ({
  default: mockLog,
}));
await jest.unstable_mockModule('../../helpers/CLSHelper.js', () => ({
  default: { get: jest.fn(() => 'trace-1') },
}));
await jest.unstable_mockModule('../../helpers/StringHelper.js', () => ({
  default: { generateUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001') },
}));
await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: jest.fn().mockImplementation((tenant) => ({ tenant })),
}));

const { default: ConsentAuditBusiness } = await import('../../business/ConsentAuditBusiness.js');

describe('ConsentAuditBusiness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.createPending.mockResolvedValue({ id: 'log-1' });
    mockLog.complete.mockResolvedValue({ id: 'log-1' });
  });

  it('writes pending before the target call and stores the raw target response', async () => {
    const audit = new ConsentAuditBusiness({
      id: 'tenant-1',
      name: 'shop',
      shopify: { domain: 'shop.myshopify.com' },
    }, {
      sourceSystem: 'NEBIM',
      targetSystem: 'SHOPIFY',
      triggerType: 'CRON',
    });

    const result = await audit.execute(
      { operation: 'UPDATE_EMAIL_CONSENT', channel: 'EMAIL' },
      { customerId: 'customer-1' },
      async () => ({ data: { updated: true } }),
    );

    expect(result).toEqual({ data: { updated: true } });
    expect(mockLog.createPending.mock.invocationCallOrder[0])
      .toBeLessThan(mockLog.complete.mock.invocationCallOrder[0]);
    expect(mockLog.complete).toHaveBeenCalledWith('log-1', expect.objectContaining({
      status: 'SUCCESS',
      targetResponseRaw: '{"data":{"updated":true}}',
    }));
  });

  it('stores raw target errors and rethrows', async () => {
    const audit = new ConsentAuditBusiness({ id: 'tenant-1' }, {
      sourceSystem: 'SHOPIFY',
      targetSystem: 'NEBIM',
      triggerType: 'WEBHOOK',
    });
    const error = Object.assign(new Error('Nebim failed'), {
      response: { status: 500, data: { Exception: 'failure' } },
    });

    await expect(audit.execute(
      { operation: 'UPDATE_SMS_CONSENT' },
      { CurrAccCode: 'C001' },
      async () => { throw error; },
    )).rejects.toThrow('Nebim failed');

    expect(mockLog.complete).toHaveBeenCalledWith('log-1', expect.objectContaining({
      status: 'FAILED',
      targetHttpStatus: 500,
      targetResponseRaw: '{"Exception":"failure"}',
    }));
  });
});
