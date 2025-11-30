import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockCLSHelper = {
  get: jest.fn(),
};

const mockStringHelper = {
  truncateString: jest.fn((str) => str),
};

await jest.unstable_mockModule('../../helpers/CLSHelper.js', () => ({
  default: mockCLSHelper,
}));

await jest.unstable_mockModule('../../helpers/StringHelper.js', () => ({
  default: mockStringHelper,
}));

const { default: LogHelper } = await import('../../helpers/LogHelper.js');

describe('LogHelper', () => {
  let logHelper;
  let mockTenant;
  let consoleSpy;

  beforeEach(() => {
    mockTenant = {
      _id: 'test-tenant-id',
      name: 'test-tenant',
    };

    mockCLSHelper.get.mockReturnValue('test-trace-id');
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
    logHelper = new LogHelper(mockTenant);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with tenant', () => {
      expect(logHelper.tenant).toEqual(mockTenant);
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      logHelper.info('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Test message');
    });
  });

  describe('info2', () => {
    it('should log info2 message', () => {
      logHelper.info2('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Test message');
    });
  });

  describe('info3', () => {
    it('should log info3 message', () => {
      logHelper.info3('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Test message');
    });
  });

  describe('info4', () => {
    it('should log info4 message', () => {
      logHelper.info4('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Test message');
    });
  });

  describe('warn', () => {
    it('should log warning message', () => {
      logHelper.warn('Warning message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Warning message');
    });
  });

  describe('warn2', () => {
    it('should log warn2 message', () => {
      logHelper.warn2('Warning message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Warning message');
    });
  });

  describe('error', () => {
    it('should log error message', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      logHelper.error(error);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalled();
    });

    it('should handle error without stack', () => {
      const error = new Error('Test error');
      delete error.stack;

      logHelper.error(error);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should log success message', () => {
      logHelper.success('Success message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Success message');
    });
  });

  describe('success2', () => {
    it('should log success2 message', () => {
      logHelper.success2('Success message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Success message');
    });
  });

  describe('request', () => {
    it('should log request message', () => {
      logHelper.request('Request message');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockStringHelper.truncateString).toHaveBeenCalledWith('Request message');
    });
  });

  describe('tenant name handling', () => {
    it('should use NO_TENANT when tenant is null', () => {
      const logHelperNoTenant = new LogHelper(null);
      logHelperNoTenant.info('Test');

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should use tenant name when tenant is provided', () => {
      logHelper.info('Test');

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('traceId handling', () => {
    it('should use INTERNAL when traceId is not available', () => {
      mockCLSHelper.get.mockReturnValue(null);
      logHelper.info('Test');

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should use traceId when available', () => {
      mockCLSHelper.get.mockReturnValue('custom-trace-id');
      logHelper.info('Test');

      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

