import { normalizeEmail, trimString } from './string.util.js';

describe('string utils', () => {
  describe('normalizeEmail', () => {
    it('trims and lowercases', () => {
      expect(normalizeEmail('  User@Example.COM \n')).toBe('user@example.com');
    });

    it.each([undefined, null, 42, { email: 'A@B.C' }])(
      'returns non-string %j unchanged',
      (value) => {
        expect(normalizeEmail(value)).toBe(value);
      },
    );
  });

  describe('trimString', () => {
    it('trims without changing case', () => {
      expect(trimString('  Nguyen Van A  ')).toBe('Nguyen Van A');
    });

    it('turns a whitespace-only string into an empty one', () => {
      expect(trimString('   ')).toBe('');
    });

    it.each([undefined, null, 42])(
      'returns non-string %j unchanged',
      (value) => {
        expect(trimString(value)).toBe(value);
      },
    );
  });
});
