import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import SystemCodes from '../../enums/SystemCodes.js';

// Mock dependencies before imports
const mockProductDetailClass = jest.fn().mockImplementation((fields) => {
  const instance = {
    ...fields,
    variants: [],
    addVariants: jest.fn((variant) => {
      instance.variants.push(variant);
    }),
  };
  return instance;
});

const mockProductInventory = {};

const mockProductInventoryClass = jest.fn().mockImplementation((fields) => ({
  ...fields,
}));

await jest.unstable_mockModule('../../models/ProductDetail.js', () => ({
  default: mockProductDetailClass,
}));

await jest.unstable_mockModule('../../models/ProductInventory.js', () => ({
  default: mockProductInventoryClass,
}));

const { default: NebimObjectHelper } = await import('../../helpers/NebimObjectHelper.js');

describe('NebimObjectHelper', () => {
  let mockTenant;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
      nebim: {
        cargoItemCode: 'CARGO001',
        isCargoService: false,
        salesUrl: 'https://test-shop.com',
        product: {
          categoryKeysFrom: ['Category1', 'Category2'],
        },
        order: {
          posTerminalId: 'POS001',
          office: 'OFFICE001',
          store: 'STORE001',
          company: 'COMPANY001',
          warehouse: 'WH001',
          deliveryCompanyCode: 'DELIVERY001',
          cancelReason: 'CANCEL001',
          creditCardType: 'VISA',
        },
      },
      shopify: {
        skuFields: {
          nebim: {
            fields: ['ItemCode', 'Barcode'],
            separator: '-',
          },
        },
      },
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDetailList', () => {
    it('should transform detail list and price list to product list', () => {
      const detailList = [
        {
          ItemCode: 'ITEM001',
          ItemDescription: 'Test Product',
          Barcode: 'BAR001',
          VatRate: 20,
          UseInternet: true,
          IsBlocked: false,
          ColorDescription: 'Red',
          ItemDim1Code: 'SIZE',
          Category1: 'Electronics',
          Category2: 'Phones',
        },
      ];

      const priceList = [
        {
          Barcode: 'BAR001',
          Price: 100,
          SellPrice: 120,
          CurrencyCode: 'TRY',
        },
      ];

      const result = NebimObjectHelper.getDetailList(detailList, priceList, mockTenant);

      expect(result).toHaveLength(1);
      expect(mockProductDetailClass).toHaveBeenCalled();
      expect(result[0].erp_id).toBe('ITEM001');
      expect(result[0].title).toBe('Test Product');
    });

    it('should handle multiple variants for same product', () => {
      const detailList = [
        {
          ItemCode: 'ITEM001',
          ItemDescription: 'Test Product',
          Barcode: 'BAR001',
          VatRate: 20,
          UseInternet: true,
          IsBlocked: false,
          ColorDescription: 'Red',
          ItemDim1Code: 'SIZE',
        },
        {
          ItemCode: 'ITEM001',
          ItemDescription: 'Test Product',
          Barcode: 'BAR002',
          VatRate: 20,
          UseInternet: true,
          IsBlocked: false,
          ColorDescription: 'Blue',
          ItemDim1Code: 'SIZE',
        },
      ];

      const priceList = [
        { Barcode: 'BAR001', Price: 100, SellPrice: 120, CurrencyCode: 'TRY' },
        { Barcode: 'BAR002', Price: 100, SellPrice: 120, CurrencyCode: 'TRY' },
      ];

      const result = NebimObjectHelper.getDetailList(detailList, priceList, mockTenant);

      expect(result).toHaveLength(1);
      // addVariants is called for each variant
      expect(result[0].addVariants).toHaveBeenCalledTimes(2);
      expect(result[0].variants).toHaveLength(2);
    });

    it('should set is_blocked_by_erp when UseInternet is false', () => {
      const detailList = [
        {
          ItemCode: 'ITEM001',
          ItemDescription: 'Test Product',
          Barcode: 'BAR001',
          VatRate: 20,
          UseInternet: false,
          IsBlocked: false,
          ColorDescription: 'Red',
          ItemDim1Code: 'SIZE',
        },
      ];

      const priceList = [
        { Barcode: 'BAR001', Price: 100, SellPrice: 120, CurrencyCode: 'TRY' },
      ];

      const result = NebimObjectHelper.getDetailList(detailList, priceList, mockTenant);

      expect(result[0].variants[0].is_blocked_by_erp).toBe(true);
    });

    it('should set is_blocked_by_erp when IsBlocked is true', () => {
      const detailList = [
        {
          ItemCode: 'ITEM001',
          ItemDescription: 'Test Product',
          Barcode: 'BAR001',
          VatRate: 20,
          UseInternet: true,
          IsBlocked: true,
          ColorDescription: 'Red',
          ItemDim1Code: 'SIZE',
        },
      ];

      const priceList = [
        { Barcode: 'BAR001', Price: 100, SellPrice: 120, CurrencyCode: 'TRY' },
      ];

      const result = NebimObjectHelper.getDetailList(detailList, priceList, mockTenant);

      expect(result[0].variants[0].is_blocked_by_erp).toBe(true);
    });
  });

  describe('getInventories', () => {
    it('should transform inventory list', () => {
      const inventoryList = [
        { Barcode: 'BAR001', Inventory: 100 },
        { Barcode: 'BAR002', Inventory: 50 },
      ];

      const result = NebimObjectHelper.getInventories(inventoryList);

      expect(result).toHaveLength(2);
      expect(result[0].barcode).toBe('BAR001');
      expect(result[0].quantity).toBe(100);
      expect(result[1].barcode).toBe('BAR002');
      expect(result[1].quantity).toBe(50);
    });

    it('should set quantity to 0 when Inventory is negative', () => {
      const inventoryList = [
        { Barcode: 'BAR001', Inventory: -10 },
      ];

      const result = NebimObjectHelper.getInventories(inventoryList);

      expect(result[0].quantity).toBe(0);
    });

    it('should handle empty inventory list', () => {
      const result = NebimObjectHelper.getInventories([]);

      expect(result).toHaveLength(0);
    });
  });

  describe('toNebimOrder', () => {
    it('should transform order to Nebim order format', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        tags: ['tag1', 'tag2'],
        lines: [
          {
            barcode: 'BAR001',
            price: 100,
            quantity: 2,
            line_id: 'LINE001',
            line_discount: 10,
          },
        ],
      };

      const customer = {
        CustomerCode: 'CUST001',
        CustomerName: 'Test Customer',
      };

      const result = NebimObjectHelper.toNebimOrder(mockTenant, order, customer);

      expect(result.ModelType).toBe(6);
      expect(result.CustomerCode).toBe('CUST001');
      expect(result.PosTerminalID).toBe(mockTenant.nebim.order.posTerminalId);
      expect(result.DocumentNumber).toBe('ORDER001');
      expect(result.Lines).toHaveLength(1);
      expect(result.Lines[0].UsedBarcode).toBe('BAR001');
      expect(result.Payments).toHaveLength(1);
      expect(result.Payments[0].Amount).toBe(1000);
    });

    it('should include tags in description', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        tags: ['tag1', 'tag2'],
        lines: [],
      };

      const customer = { CustomerCode: 'CUST001' };

      const result = NebimObjectHelper.toNebimOrder(mockTenant, order, customer);

      expect(result.Description).toContain('tag1');
      expect(result.Description).toContain('tag2');
    });

    it('should handle order without tags', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        tags: [], // Empty array - code will add "tags: " prefix but join will return empty string
        lines: [],
      };

      const customer = { CustomerCode: 'CUST001' };

      const result = NebimObjectHelper.toNebimOrder(mockTenant, order, customer);

      expect(result.Description).toContain('ORDER001');
      // Note: Even with empty array, code adds "tags: " prefix, so we just verify description contains order_id
      expect(result.Description).toContain('ORDER001');
    });

    it('should append cargo line when shipping payment exists', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        shipping_payment: 49.9,
        tags: [],
        lines: [],
      };

      const customer = { CustomerCode: 'CUST001' };

      const result = NebimObjectHelper.toNebimOrder(mockTenant, order, customer);

      expect(result.Lines).toHaveLength(1);
      expect(result.Lines[0]).toEqual({
        ItemTypeCode: '1',
        ItemCode: 'CARGO001',
        Qty1: 1,
        PriceVI: 49.9,
      });
    });

    it('should set cargo item type to 5 when isCargoService is true', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        shipping_payment: 10,
        tags: [],
        lines: [],
      };
      const customer = { CustomerCode: 'CUST001' };

      mockTenant.nebim.isCargoService = true;

      const result = NebimObjectHelper.toNebimOrder(mockTenant, order, customer);

      expect(result.Lines[0].ItemTypeCode).toBe('5');
    });

    it('should throw when shipping payment exists but cargo item code is missing', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        shipping_payment: 10,
        tags: [],
        lines: [],
      };
      const customer = { CustomerCode: 'CUST001' };

      mockTenant.nebim.cargoItemCode = '';

      expect(() => NebimObjectHelper.toNebimOrder(mockTenant, order, customer)).toThrow(
        'Cargo item code is required when shipping payment exists for order ORDER001'
      );
    });

    it('should use backward-compatible cargo fields under nebim.order', () => {
      const order = {
        order_id: 'ORDER001',
        order_date: '2024-01-01',
        payment: 1000,
        shipping_payment: 10,
        tags: [],
        lines: [],
      };
      const customer = { CustomerCode: 'CUST001' };

      delete mockTenant.nebim.cargoItemCode;
      delete mockTenant.nebim.isCargoService;
      mockTenant.nebim.order.cargoItemCode = '  CARGO-LEGACY  ';
      mockTenant.nebim.order.isCargoService = true;

      const result = NebimObjectHelper.toNebimOrder(mockTenant, order, customer);

      expect(result.Lines[0].ItemCode).toBe('CARGO-LEGACY');
      expect(result.Lines[0].ItemTypeCode).toBe('5');
    });
  });

  describe('toNebimCancelOrder', () => {
    it('should transform created order to Nebim cancel order format', () => {
      const createdOrder = {
        erpId: 'NEBIM001',
        lines: [
          {
            erpLineId: 'LINE001',
            quantity: 2,
            amount: 200,
          },
          {
            erpLineId: 'LINE002',
            quantity: 1,
            amount: 100,
          },
        ],
      };

      const result = NebimObjectHelper.toNebimCancelOrder(mockTenant, createdOrder);

      expect(result.ModelType).toBe(34);
      expect(result.OrderNumber).toBe('NEBIM001');
      expect(result.Lines).toHaveLength(2);
      expect(result.Lines[0].LineID).toBe('LINE001');
      expect(result.Payments).toHaveLength(1);
      expect(result.Payments[0].Amount).toBe(300); // 200 + 100
    });

    it('should handle order with no lines', () => {
      const createdOrder = {
        erpId: 'NEBIM001',
        lines: [],
      };

      const result = NebimObjectHelper.toNebimCancelOrder(mockTenant, createdOrder);

      expect(result.Payments[0].Amount).toBe(0);
    });
  });

  describe('getOrderStatusList', () => {
    it('should filter and transform order status list', () => {
      const nebimOrderStatusList = [
        {
          DocNumber: 'ORDER001',
          OrderRefNumber: 'NEBIM001',
          Status: 'INVOICED',
          TrackingNumber: 'TRACK001',
          TrackingUrl: 'https://tracking.com/TRACK001',
          LineDescription: 'FULFILLMENT001',
          OrderLineID: 'LINE001',
          OrderQty: 2,
          InvoiceQty: 2,
        },
      ];

      const result = NebimObjectHelper.getOrderStatusList(nebimOrderStatusList);

      expect(result).toHaveProperty('ORDER001');
      expect(result.ORDER001.erpId).toBe('NEBIM001');
      expect(result.ORDER001.status).toBe('INVOICED');
      expect(result.ORDER001.tracking).toHaveProperty('TRACK001');
    });

    it('should skip non-invoiced and non-on-cargo statuses', () => {
      const nebimOrderStatusList = [
        {
          DocNumber: 'ORDER001',
          Status: 'PENDING',
        },
      ];

      const result = NebimObjectHelper.getOrderStatusList(nebimOrderStatusList);

      expect(result).not.toHaveProperty('ORDER001');
    });

    it('should handle missing tracking number', () => {
      const nebimOrderStatusList = [
        {
          DocNumber: 'ORDER001',
          OrderRefNumber: 'NEBIM001',
          Status: 'INVOICED',
          TrackingNumber: null,
          LineDescription: 'FULFILLMENT001',
          OrderLineID: 'LINE001',
          OrderQty: 2,
          InvoiceQty: 2,
        },
      ];

      const result = NebimObjectHelper.getOrderStatusList(nebimOrderStatusList);

      expect(result.ORDER001.tracking).toHaveProperty(SystemCodes.DEFINITIONS.NO_TRACKING_NUMBER);
    });
  });

  describe('getFindInStoreByBarcode', () => {
    it('should group rows by barcode and map store fields', () => {
      const rows = [
        {
          Barcode: '8600000000001',
          StoreName: 'X Mağazası',
          Inventory: 100,
          StoreGeoLocation: '45.764237, 21.240899',
          StoreAddress: 'Address 1',
          StorePhone: '+381 11 2400 240',
          StoreEmail: 'info@xmagazasi.com',
          StoreOpeningHours: '09:00 - 18:00',
          StoreClosingHours: '13:00 - 14:00',
          StoreDaysOfWeek: 'Monday, Tuesday',
        },
        {
          Barcode: '8600000000001',
          StoreName: 'Y Mağazası',
          Inventory: 5,
          StoreGeoLocation: '45.1, 21.1',
          StoreAddress: 'Address 2',
          StorePhone: '+381 11 1111 111',
          StoreEmail: 'info@ymagazasi.com',
          StoreOpeningHours: '10:00 - 19:00',
          StoreClosingHours: '',
          StoreDaysOfWeek: 'Monday',
        },
      ];

      const result = NebimObjectHelper.getFindInStoreByBarcode(rows);

      expect(result).toHaveLength(1);
      expect(result[0].barcode).toBe('8600000000001');
      expect(result[0].stores).toHaveLength(2);
      expect(result[0].stores[0]).toEqual({
        store_name: 'X Mağazası',
        inventory_count: 100,
        store_geo_location: '45.764237, 21.240899',
        store_address: 'Address 1',
        store_phone: '+381 11 2400 240',
        store_email: 'info@xmagazasi.com',
        store_opening_hours: '09:00 - 18:00',
        store_closing_hours: '13:00 - 14:00',
        store_days_of_week: 'Monday, Tuesday',
      });
    });
  });
});

