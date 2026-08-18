import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockNebim = { runProc: jest.fn() };
const mockShopify = { query: jest.fn() };
const auditCalls = [];
const mockAudit = {
  execute: jest.fn(async (metadata, request, executor) => {
    auditCalls.push({ metadata, request });
    return executor();
  }),
};

await jest.unstable_mockModule('../../apis/NebimV3IntegratorAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockNebim),
}));
await jest.unstable_mockModule('../../apis/ShopifyGqlAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockShopify),
}));
await jest.unstable_mockModule('../../business/ConsentAuditBusiness.js', () => ({
  default: jest.fn().mockImplementation(() => mockAudit),
}));
await jest.unstable_mockModule('../../core/CoreClass.js', () => ({
  default: jest.fn().mockImplementation((tenant) => ({
    tenant,
    logger: { error: jest.fn() },
    throws(message) { throw new Error(message); },
  })),
}));

const { default: CustomerConsentSyncBusiness } = await import('../../business/CustomerConsentSyncBusiness.js');

describe('CustomerConsentSyncBusiness', () => {
  let tenant;

  beforeEach(() => {
    jest.clearAllMocks();
    auditCalls.length = 0;
    tenant = {
      id: 'tenant-1',
      name: 'test-shop',
      nebim: {
        host: 'https://nebim.test',
        user: 'user',
        userGroup: 'group',
        customer: { phoneType: '7' },
        procNames: { customer: { concents: 'sp_GO_GetCustomerConcents' } },
      },
      shopify: { decyrptedApiKey: 'token' },
    };
  });

  it('updates an existing Shopify email consent directly from RunProc rows', async () => {
    mockNebim.runProc.mockResolvedValue([{
      CanSendAdvert: true,
      SMS: false,
      Email: true,
      CurrAccCode: 'C001',
      CommunicationTypeCode: '3',
      CommAddress: 'customer@example.com',
      LastUpdatedDate: '2026-08-18T10:30:00Z',
    }]);
    mockShopify.query
      .mockResolvedValueOnce({
        data: { customers: { nodes: [{ id: 'gid://shopify/Customer/1', email: 'customer@example.com', phone: null }] } },
      })
      .mockResolvedValueOnce({
        data: { customerEmailMarketingConsentUpdate: { customer: { id: 'gid://shopify/Customer/1' }, userErrors: [] } },
      });

    const business = new CustomerConsentSyncBusiness(tenant);
    const result = await business.sync('2026-08-17T00:00:00Z');

    expect(mockNebim.runProc).toHaveBeenCalledWith('sp_GO_GetCustomerConcents', {
      Date: '2026-08-17T00:00:00Z',
    });
    expect(result).toEqual({ received: 1, updated: 1, notFound: 0, ambiguous: 0, skipped: 0, failed: 0 });
    expect(auditCalls.map((call) => call.metadata.operation)).toEqual(['FIND_CUSTOMER', 'UPDATE_EMAIL_CONSENT']);
  });

  it('does not create a customer when the Nebim customer is absent from Shopify', async () => {
    mockNebim.runProc.mockResolvedValue([{
      CanSendAdvert: false,
      SMS: true,
      Email: false,
      CurrAccCode: 'STORE-CUSTOMER',
      CommunicationTypeCode: '7',
      CommAddress: '05551234567',
      LastUpdatedDate: '2026-08-18T10:30:00Z',
    }]);
    mockShopify.query.mockResolvedValue({ data: { customers: { nodes: [] } } });

    const business = new CustomerConsentSyncBusiness(tenant);
    const result = await business.sync('2026-08-17T00:00:00Z');

    expect(result.notFound).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockShopify.query).toHaveBeenCalledTimes(1);
    expect(auditCalls.map((call) => call.metadata.operation)).toEqual(['FIND_CUSTOMER']);
  });

  it('uses the tenant phone type and updates an existing Shopify SMS consent', async () => {
    mockNebim.runProc.mockResolvedValue([{
      CanSendAdvert: false,
      SMS: true,
      Email: false,
      CurrAccCode: 'C002',
      CommunicationTypeCode: '7',
      CommAddress: '05551234567',
      LastUpdatedDate: '2026-08-18T11:00:00Z',
    }]);
    mockShopify.query
      .mockResolvedValueOnce({
        data: { customers: { nodes: [{ id: 'gid://shopify/Customer/2', email: null, phone: '+905551234567' }] } },
      })
      .mockResolvedValueOnce({
        data: { customerSmsMarketingConsentUpdate: { customer: { id: 'gid://shopify/Customer/2' }, userErrors: [] } },
      });

    const business = new CustomerConsentSyncBusiness(tenant);
    const result = await business.sync('2026-08-17T00:00:00Z');

    expect(result.updated).toBe(1);
    expect(mockShopify.query.mock.calls[0][1]).toEqual({ query: 'phone:+905551234567' });
    expect(mockShopify.query.mock.calls[1][1]).toEqual({
      input: {
        customerId: 'gid://shopify/Customer/2',
        smsMarketingConsent: {
          marketingState: 'UNSUBSCRIBED',
          marketingOptInLevel: 'SINGLE_OPT_IN',
          consentUpdatedAt: '2026-08-18T11:00:00.000Z',
        },
      },
    });
    expect(auditCalls.map((call) => call.metadata.operation)).toEqual(['FIND_CUSTOMER', 'UPDATE_SMS_CONSENT']);
  });
});
