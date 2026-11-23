import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';
import { RefreshTokenDto } from './refresh-token.dto.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../auth.constants.js';
import { RegisterDto } from './register.dto.js';

async function check<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true });
  const failed: Record<string, string[]> = {};
  for (const error of errors) {
    failed[error.property] = Object.keys(error.constraints ?? {});
  }
  return { instance, failed };
}

const VALID_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.Zm9vYmFyYmF6cXV4cXV1eHF1dXhxdXV4cXV1eA';

describe('RegisterDto', () => {
  const valid = {
    email: 'user@example.com',
    password: 'Secret123!',
    name: 'User',
  };

  it('accepts a valid payload', async () => {
    const { failed } = await check(RegisterDto, valid);
    expect(failed).toEqual({});
  });

  it('trims and lowercases the email, and trims the name', async () => {
    const { instance, failed } = await check(RegisterDto, {
      ...valid,
      email: '  User@Example.COM ',
      name: '  User  ',
    });

    expect(failed).toEqual({});
    expect(instance.email).toBe('user@example.com');
    expect(instance.name).toBe('User');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed', 'not-an-email'],
    ['non-string', 123],
  ])('rejects a %s email', async (_label, email) => {
    const { failed } = await check(RegisterDto, { ...valid, email });
    expect(failed.email).toEqual(expect.arrayContaining(['isEmail']));
  });

  it('rejects an email longer than 255 characters', async () => {
    const email = `${'a'.repeat(250)}@example.com`;
    const { failed } = await check(RegisterDto, { ...valid, email });
    expect(failed.email).toEqual(expect.arrayContaining(['maxLength']));
  });

  it.each([
    [PASSWORD_MIN_LENGTH - 1, 'minLength'],
    [PASSWORD_MAX_LENGTH + 1, 'maxLength'],
  ])('rejects a %i-character password (%s)', async (length, constraint) => {
    const { failed } = await check(RegisterDto, {
      ...valid,
      password: 'x'.repeat(length),
    });
    expect(failed.password).toEqual(expect.arrayContaining([constraint]));
  });

  it.each([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH])(
    'accepts a %i-character password (boundary)',
    async (length) => {
      const { failed } = await check(RegisterDto, {
        ...valid,
        password: 'x'.repeat(length),
      });
      expect(failed.password).toBeUndefined();
    },
  );

  it('rejects a non-string password', async () => {
    const { failed } = await check(RegisterDto, {
      ...valid,
      password: 12345678,
    });
    expect(failed.password).toEqual(expect.arrayContaining(['isString']));
  });

  it.each([
    ['missing', undefined, 'isNotEmpty'],
    ['whitespace-only', '   ', 'isNotEmpty'],
    ['too long', 'n'.repeat(101), 'maxLength'],
    ['non-string', 42, 'isString'],
  ])('rejects a %s name', async (_label, name, constraint) => {
    const { failed } = await check(RegisterDto, { ...valid, name });
    expect(failed.name).toEqual(expect.arrayContaining([constraint]));
  });

  it('accepts a 100-character name (boundary)', async () => {
    const { failed } = await check(RegisterDto, {
      ...valid,
      name: 'n'.repeat(100),
    });
    expect(failed.name).toBeUndefined();
  });
});

describe('LoginDto', () => {
  it('accepts a valid payload and normalizes the email', async () => {
    const { instance, failed } = await check(LoginDto, {
      email: ' USER@example.com',
      password: 'anything',
    });
    expect(failed).toEqual({});
    expect(instance.email).toBe('user@example.com');
  });

  it('does not enforce password length (only register does)', async () => {
    const { failed } = await check(LoginDto, {
      email: 'user@example.com',
      password: 'x',
    });
    expect(failed).toEqual({});
  });

  it('rejects missing credentials', async () => {
    const { failed } = await check(LoginDto, {});
    expect(failed.email).toEqual(expect.arrayContaining(['isNotEmpty']));
    expect(failed.password).toEqual(expect.arrayContaining(['isNotEmpty']));
  });
});

describe('RefreshTokenDto', () => {
  it('accepts a JWT-shaped token', async () => {
    const { failed } = await check(RefreshTokenDto, {
      refreshToken: VALID_JWT,
    });
    expect(failed).toEqual({});
  });

  it.each([
    ['missing', undefined, 'isNotEmpty'],
    ['not a JWT', 'abc', 'isJwt'],
  ])('rejects a %s refresh token', async (_label, refreshToken, constraint) => {
    const { failed } = await check(RefreshTokenDto, { refreshToken });
    expect(failed.refreshToken).toEqual(expect.arrayContaining([constraint]));
  });
});
