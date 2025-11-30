import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const { default: CoreModel } = await import('../../core/CoreModel.js');

describe('CoreModel', () => {
  let model;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with fields', () => {
      const fields = {
        id: '123',
        name: 'Test Model',
        value: 100,
      };

      model = new CoreModel(fields);

      expect(model.id).toBe('123');
      expect(model.name).toBe('Test Model');
      expect(model.value).toBe(100);
    });

    it('should create instance with empty fields', () => {
      model = new CoreModel({});

      expect(model).toEqual({});
    });

    it('should handle nested objects', () => {
      const fields = {
        id: '123',
        nested: {
          key: 'value',
        },
      };

      model = new CoreModel(fields);

      expect(model.id).toBe('123');
      expect(model.nested).toEqual({ key: 'value' });
    });

    it('should handle arrays', () => {
      const fields = {
        id: '123',
        items: [1, 2, 3],
      };

      model = new CoreModel(fields);

      expect(model.id).toBe('123');
      expect(model.items).toEqual([1, 2, 3]);
    });
  });
});

