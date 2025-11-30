import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import CacheDatabases from '../../enums/CacheDatabases.js';

// No need to mock dependencies for ClientProvider as it's a simple class

const { default: ClientProvider } = await import('../../cache/ClientProvider.js');

describe('ClientProvider', () => {
  beforeEach(() => {
    // Reset static clients
    ClientProvider.systemClient = null;
    ClientProvider.nebimClient = null;
    ClientProvider.shopifyClient = null;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set systemClient when dbIndex is SystemCache', () => {
      const mockClient = { test: 'system' };
      ClientProvider.systemClient = mockClient;

      const provider = new ClientProvider(CacheDatabases.DB_NAMES.SystemCache);

      expect(provider.client).toBe(mockClient);
    });

    it('should set nebimClient when dbIndex is NebimCache', () => {
      const mockClient = { test: 'nebim' };
      ClientProvider.nebimClient = mockClient;

      const provider = new ClientProvider(CacheDatabases.DB_NAMES.NebimCache);

      expect(provider.client).toBe(mockClient);
    });

    it('should set shopifyClient when dbIndex is ShopifyCache', () => {
      const mockClient = { test: 'shopify' };
      ClientProvider.shopifyClient = mockClient;

      const provider = new ClientProvider(CacheDatabases.DB_NAMES.ShopifyCache);

      expect(provider.client).toBe(mockClient);
    });

    it('should not set client for unknown dbIndex', () => {
      const provider = new ClientProvider(999);

      expect(provider.client).toBeUndefined();
    });
  });

  describe('static clients', () => {
    it('should have static systemClient property', () => {
      expect(ClientProvider.systemClient).toBeDefined();
    });

    it('should have static nebimClient property', () => {
      expect(ClientProvider.nebimClient).toBeDefined();
    });

    it('should have static shopifyClient property', () => {
      expect(ClientProvider.shopifyClient).toBeDefined();
    });

    it('should allow setting static clients', () => {
      const mockSystemClient = { id: 'system' };
      ClientProvider.systemClient = mockSystemClient;

      expect(ClientProvider.systemClient).toBe(mockSystemClient);
    });
  });
});

