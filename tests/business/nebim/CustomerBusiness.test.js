import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockApi = {
  runProcReturnSingle: jest.fn(),
  getModel: jest.fn(),
  post: jest.fn(),
};

const mockCache = {
  findAddressCode: jest.fn(),
};

const mockNebimCache = jest.fn().mockImplementation(() => mockCache);

const mockCoreClass = jest.fn().mockImplementation(() => ({
  tenant: {},
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  throws: jest.fn((message) => {
    throw new Error(message);
  }),
}));

await jest.unstable_mockModule('../../../apis/NebimV3IntegratorAPI.js', () => ({
  default: jest.fn().mockImplementation(() => mockApi),
}));

await jest.unstable_mockModule('../../../cache/NebimCache.js', () => ({
  default: mockNebimCache,
}));

await jest.unstable_mockModule('../../../core/CoreClass.js', () => ({
  default: mockCoreClass,
}));

const { default: NebimCustomerBusiness } = await import('../../../business/nebim/CustomerBusiness.js');

describe('NebimCustomerBusiness', () => {
  let business;
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      nebim: {
        procNames: {
          customer: {
            check: 'CheckCustomer',
          },
        },
        customer: {
          addressType: 'S',
          phoneType: '1',
          confirmationFormTypeCode: 'CF001',
          confirmationFormStatusCode: 'CFS001',
          inactivationReasonCode: 'IRC001',
          consentSource: 'digital',
        },
        order: {
          office: 'OFF001',
        },
      },
    };

    jest.clearAllMocks();
    business = new NebimCustomerBusiness(mockTenant);
    business.tenant = mockTenant;
    business.api = mockApi;
    business.cache = mockCache;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchCustomer', () => {
    it('should fetch customer by email and phone', async () => {
      const email = 'test@example.com';
      const phone = '5551234567';
      const mockShortInfo = {
        CustomerCode: 'CUST001',
      };
      const mockCustomer = {
        CurrAccCode: 'CUST001',
        FirstName: 'John',
        LastName: 'Doe',
      };

      mockApi.runProcReturnSingle.mockResolvedValue(mockShortInfo);
      mockApi.getModel.mockResolvedValue(mockCustomer);

      const result = await business.fetchCustomer({ email, phone });

      expect(mockApi.runProcReturnSingle).toHaveBeenCalledWith('CheckCustomer', {
        Email: email,
        Phone: phone,
      });
      expect(mockApi.getModel).toHaveBeenCalledWith('customer', 'CUST001');
      expect(result).toEqual(mockCustomer);
    });

    it('should fetch customer by email only', async () => {
      const email = 'test@example.com';
      const mockShortInfo = {
        CustomerCode: 'CUST001',
      };
      const mockCustomer = {
        CurrAccCode: 'CUST001',
        FirstName: 'John',
        LastName: 'Doe',
      };

      mockApi.runProcReturnSingle.mockResolvedValue(mockShortInfo);
      mockApi.getModel.mockResolvedValue(mockCustomer);

      const result = await business.fetchCustomer({ email });

      expect(mockApi.runProcReturnSingle).toHaveBeenCalledWith('CheckCustomer', {
        Email: email,
        Phone: '',
      });
      expect(result).toEqual(mockCustomer);
    });

    it('should fetch customer by phone only', async () => {
      const phone = '5551234567';
      const mockShortInfo = {
        CustomerCode: 'CUST001',
      };
      const mockCustomer = {
        CurrAccCode: 'CUST001',
        FirstName: 'John',
        LastName: 'Doe',
      };

      mockApi.runProcReturnSingle.mockResolvedValue(mockShortInfo);
      mockApi.getModel.mockResolvedValue(mockCustomer);

      const result = await business.fetchCustomer({ phone });

      expect(mockApi.runProcReturnSingle).toHaveBeenCalledWith('CheckCustomer', {
        Email: '',
        Phone: phone,
      });
      expect(result).toEqual(mockCustomer);
    });

    it('should return null when customer not found', async () => {
      const email = 'test@example.com';
      const phone = '5551234567';
      const mockShortInfo = {};

      mockApi.runProcReturnSingle.mockResolvedValue(mockShortInfo);

      const result = await business.fetchCustomer({ email, phone });

      expect(mockApi.getModel).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null when CustomerCode is missing', async () => {
      const email = 'test@example.com';
      const phone = '5551234567';
      const mockShortInfo = {
        CustomerCode: null,
      };

      mockApi.runProcReturnSingle.mockResolvedValue(mockShortInfo);

      const result = await business.fetchCustomer({ email, phone });

      expect(mockApi.getModel).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('syncCustomerFromOrder', () => {
    it('should update existing customer', async () => {
      const order = {
        customer: {
          email: 'test@example.com',
          phone: '5551234567',
        },
        address: {
          address_text: 'Test Address',
          city: 'Istanbul',
          district: 'Kadikoy',
        },
        is_receiver_not_customer: false,
      };

      const mockNebimCustomer = {
        CurrAccCode: 'CUST001',
        PostalAddresses: [
          {
            Address: 'Test Address',
            PostalAddressID: 'ADDR001',
          },
        ],
      };

      mockApi.runProcReturnSingle.mockResolvedValue({
        CustomerCode: 'CUST001',
      });
      mockApi.getModel.mockResolvedValue(mockNebimCustomer);
      mockCache.findAddressCode.mockResolvedValue({
        CountryCode: 'TR',
        StateCode: '34',
        CityCode: '3401',
        DistrictCode: '340101',
      });
      mockApi.post.mockResolvedValue({
        CurrAccCode: 'CUST001',
        PostalAddresses: [
          {
            Address: 'Test Address',
            PostalAddressID: 'ADDR001',
          },
        ],
      });

      const result = await business.syncCustomerFromOrder(order);

      expect(result).toHaveProperty('CustomerCode');
      expect(result).toHaveProperty('ShippingPostalAddressID');
    });

    it('should create new customer when not exists', async () => {
      const order = {
        customer: {
          email: 'new@example.com',
          phone: '5551234567',
          first_name: 'Jane',
          last_name: 'Doe',
          consents: {
            email: {
              date: '2024-01-01T10:00:00Z',
              is_opt_in: true,
            },
            gsm: {
              date: '2024-01-01T10:00:00Z',
              is_opt_in: true,
            },
          },
        },
        address: {
          address_text: 'New Address',
          city: 'Istanbul',
          district: 'Kadikoy',
          first_name: 'Jane',
          last_name: 'Doe',
          phone: '5551234567',
        },
        is_receiver_not_customer: false,
      };

      mockApi.runProcReturnSingle.mockResolvedValue({});
      mockCache.findAddressCode.mockResolvedValue({
        CountryCode: 'TR',
        StateCode: '34',
        CityCode: '3401',
        DistrictCode: '340101',
      });
      mockApi.post.mockResolvedValue({
        CurrAccCode: 'CUST002',
        PostalAddresses: [
          {
            Address: 'New Address',
            PostalAddressID: 'ADDR002',
          },
        ],
      });

      const result = await business.syncCustomerFromOrder(order);

      expect(mockApi.post).toHaveBeenCalled();
      expect(result).toHaveProperty('CustomerCode');
      expect(result).toHaveProperty('ShippingPostalAddressID');
    });

    it('should handle receiver not customer scenario', async () => {
      const order = {
        customer: {
          email: 'test@example.com',
          phone: '5551234567',
          first_name: 'John',
          last_name: 'Doe',
          consents: {
            email: {
              date: '2024-01-01T10:00:00Z',
              is_opt_in: true,
            },
            gsm: {
              date: '2024-01-01T10:00:00Z',
              is_opt_in: true,
            },
          },
        },
        address: {
          address_text: 'Receiver Address',
          city: 'Istanbul',
          district: 'Besiktas',
          first_name: 'Receiver',
          last_name: 'Name',
          phone: '5559876543',
        },
        is_receiver_not_customer: true,
      };

      mockApi.runProcReturnSingle.mockResolvedValue({});
      mockCache.findAddressCode.mockResolvedValue({
        CountryCode: 'TR',
        StateCode: '34',
        CityCode: '3401',
        DistrictCode: '340102',
      });
      mockApi.post
        .mockResolvedValueOnce({
          CurrAccCode: 'CUST003',
          Contacts: [
            {
              ContactID: 'CONT001',
            },
          ],
          Communications: [],
        })
        .mockResolvedValueOnce({
          CurrAccCode: 'CUST003',
          PostalAddressesWithContacts: [
            {
              Address: 'Receiver Address',
              PostalAddressID: 'ADDR003',
              AddressTypeCode: 'S',
            },
          ],
        });

      const result = await business.syncCustomerFromOrder(order);

      expect(mockApi.post).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('CustomerCode');
      expect(result).toHaveProperty('ShippingPostalAddressID');
    });

    it('should throw error when address not found in cache', async () => {
      const order = {
        customer: {
          email: 'test@example.com',
          phone: '5551234567',
        },
        address: {
          address_text: 'Unknown Address',
          city: 'Unknown',
          district: 'Unknown',
        },
        is_receiver_not_customer: false,
      };

      mockApi.runProcReturnSingle.mockResolvedValue({});
      mockCache.findAddressCode.mockResolvedValue(null);

      await expect(business.syncCustomerFromOrder(order)).rejects.toThrow();
    });
  });
});

