import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  BODY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../articles.constants.js';
import { CreateArticleDto } from './create-article.dto.js';
import { ListArticlesQueryDto } from './list-articles-query.dto.js';
import { UpdateArticleDto } from './update-article.dto.js';

async function check<T extends object>(
  type: new () => T,
  plain: Record<string, unknown>,
) {
  const instance = plainToInstance(type, plain);
  const errors = await validate(instance, { whitelist: true });
  const failed: Record<string, string[]> = {};
  for (const error of errors) {
    failed[error.property] = Object.keys(error.constraints ?? {});
  }
  return { instance, failed };
}

describe('CreateArticleDto', () => {
  const valid = { title: 'Title', description: 'Desc', body: 'Body' };

  it('accepts valid fields, trimmed', async () => {
    const { instance, failed } = await check(CreateArticleDto, {
      title: '  Title  ',
      description: '  Desc  ',
      body: '  Body  ',
    });

    expect(failed).toEqual({});
    expect(instance).toMatchObject(valid);
  });

  it.each(['title', 'description', 'body'])('requires %s', async (field) => {
    const { failed } = await check(CreateArticleDto, {
      ...valid,
      [field]: undefined,
    });

    expect(failed[field]).toEqual(
      expect.arrayContaining(['isNotEmpty', 'isString']),
    );
  });

  it.each(['title', 'description', 'body'])(
    'rejects a blank %s',
    async (field) => {
      const { failed } = await check(CreateArticleDto, {
        ...valid,
        [field]: '   ',
      });

      expect(failed[field]).toEqual(['isNotEmpty']);
    },
  );

  it.each([
    ['title', TITLE_MAX_LENGTH],
    ['description', DESCRIPTION_MAX_LENGTH],
    ['body', BODY_MAX_LENGTH],
  ])('limits %s to %i characters', async (field, max) => {
    const atLimit = await check(CreateArticleDto, {
      ...valid,
      [field]: 'a'.repeat(max),
    });
    const overLimit = await check(CreateArticleDto, {
      ...valid,
      [field]: 'a'.repeat(max + 1),
    });

    expect(atLimit.failed).toEqual({});
    expect(overLimit.failed[field]).toEqual(['maxLength']);
  });

  it('rejects non-string values', async () => {
    const { failed } = await check(CreateArticleDto, { ...valid, title: 1 });

    expect(failed.title).toContain('isString');
  });
});

describe('UpdateArticleDto', () => {
  it('accepts an empty body: every field is optional', async () => {
    const { failed } = await check(UpdateArticleDto, {});

    expect(failed).toEqual({});
  });

  it('accepts a single trimmed field', async () => {
    const { instance, failed } = await check(UpdateArticleDto, {
      title: '  New  ',
    });

    expect(failed).toEqual({});
    expect(instance.title).toBe('New');
  });

  it.each(['title', 'description', 'body'])(
    'rejects a blank %s',
    async (field) => {
      const { failed } = await check(UpdateArticleDto, { [field]: '  ' });

      expect(failed[field]).toEqual(['isNotEmpty']);
    },
  );

  it('ignores unknown fields such as slug', async () => {
    const { instance } = await check(UpdateArticleDto, { slug: 'hijack' });

    expect(instance).not.toHaveProperty('slug', 'hijack');
  });
});

describe('PaginationQueryDto', () => {
  it('defaults to limit 20 and offset 0', async () => {
    const { instance, failed } = await check(PaginationQueryDto, {});

    expect(failed).toEqual({});
    expect(instance).toMatchObject({ limit: 20, offset: 0 });
  });

  it('converts query strings to numbers', async () => {
    const { instance, failed } = await check(PaginationQueryDto, {
      limit: '5',
      offset: '10',
    });

    expect(failed).toEqual({});
    expect(instance).toMatchObject({ limit: 5, offset: 10 });
  });

  it.each([
    ['limit', '0', 'min'],
    ['limit', '101', 'max'],
    ['limit', '1.5', 'isInt'],
    ['limit', 'abc', 'isInt'],
    ['offset', '-1', 'min'],
  ])('rejects %s=%s', async (field, value, constraint) => {
    const { failed } = await check(PaginationQueryDto, { [field]: value });

    expect(failed[field]).toContain(constraint);
  });
});

describe('ListArticlesQueryDto', () => {
  const id = '2f1c0f0e-8f0a-4b8e-9a43-1a2b3c4d5e6f';

  it('accepts uuid filters', async () => {
    const { failed } = await check(ListArticlesQueryDto, {
      authorId: id,
      favoritedBy: id,
    });

    expect(failed).toEqual({});
  });

  it.each(['authorId', 'favoritedBy'])(
    'rejects a malformed %s',
    async (field) => {
      const { failed } = await check(ListArticlesQueryDto, { [field]: 'nope' });

      expect(failed[field]).toEqual(['isUuid']);
    },
  );
});
