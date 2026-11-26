import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BIO_MAX_LENGTH, NAME_MAX_LENGTH } from '../users.constants.js';
import { UpdateUserDto } from './update-user.dto.js';

async function check(plain: Record<string, unknown>) {
  const instance = plainToInstance(UpdateUserDto, plain);
  const errors = await validate(instance, { whitelist: true });
  const failed: Record<string, string[]> = {};
  for (const error of errors) {
    failed[error.property] = Object.keys(error.constraints ?? {});
  }
  return { instance, failed };
}

describe('UpdateUserDto', () => {
  it('accepts an empty body: every field is optional', async () => {
    const { failed } = await check({});
    expect(failed).toEqual({});
  });

  it('accepts a valid name and bio, trimmed', async () => {
    const { instance, failed } = await check({
      name: '  New Name  ',
      bio: '  Backend developer  ',
    });

    expect(failed).toEqual({});
    expect(instance.name).toBe('New Name');
    expect(instance.bio).toBe('Backend developer');
  });

  describe('name', () => {
    it.each([
      ['empty', ''],
      ['blank', '   '],
    ])('rejects an %s name', async (_label, name) => {
      const { failed } = await check({ name });
      expect(failed.name).toEqual(['isNotEmpty']);
    });

    it('rejects a non-string name', async () => {
      const { failed } = await check({ name: 123 });
      expect(failed.name).toEqual(expect.arrayContaining(['isString']));
    });

    it(`accepts exactly ${NAME_MAX_LENGTH} characters and rejects one more`, async () => {
      const ok = await check({ name: 'a'.repeat(NAME_MAX_LENGTH) });
      const tooLong = await check({ name: 'a'.repeat(NAME_MAX_LENGTH + 1) });

      expect(ok.failed).toEqual({});
      expect(tooLong.failed.name).toEqual(['maxLength']);
    });

    it('measures the length after trimming', async () => {
      const { failed } = await check({
        name: `  ${'a'.repeat(NAME_MAX_LENGTH)}  `,
      });
      expect(failed).toEqual({});
    });
  });

  describe('bio', () => {
    it('accepts an empty bio (the service clears it)', async () => {
      const { instance, failed } = await check({ bio: '   ' });

      expect(failed).toEqual({});
      expect(instance.bio).toBe('');
    });

    it('rejects a non-string bio', async () => {
      const { failed } = await check({ bio: ['a'] });
      expect(failed.bio).toEqual(expect.arrayContaining(['isString']));
    });

    it(`accepts exactly ${BIO_MAX_LENGTH} characters and rejects one more`, async () => {
      const ok = await check({ bio: 'b'.repeat(BIO_MAX_LENGTH) });
      const tooLong = await check({ bio: 'b'.repeat(BIO_MAX_LENGTH + 1) });

      expect(ok.failed).toEqual({});
      expect(tooLong.failed.bio).toEqual(['maxLength']);
    });
  });

  it('strips fields that cannot be changed here', async () => {
    const { instance, failed } = await check({
      name: 'A',
      email: 'other@example.com',
      password: 'Secret123!',
      active: false,
      id: 'u2',
    });

    expect(failed).toEqual({});
    expect(instance).toEqual({ name: 'A' });
  });

  it('uses translated validation messages', async () => {
    const instance = plainToInstance(UpdateUserDto, { name: '' });
    const [error] = await validate(instance);

    expect(error.constraints?.isNotEmpty).toMatch(/^validation\.NOT_EMPTY\|/);
  });
});
