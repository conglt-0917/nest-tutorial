import { buildSlug, slugify } from './slug.util.js';

describe('slugify', () => {
  it.each([
    ['How to train your dragon', 'how-to-train-your-dragon'],
    ['  Hello,   World!!  ', 'hello-world'],
    ['Học NestJS với Đặng', 'hoc-nestjs-voi-dang'],
    ['Crème brûlée', 'creme-brulee'],
    ['---a---b---', 'a-b'],
  ])('turns %j into %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it.each([[''], ['   '], ['!!!'], ['日本語']])(
    'falls back for %j without usable characters',
    (input) => {
      expect(slugify(input)).toBe('article');
    },
  );

  it('truncates long titles without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(199)} ${'b'.repeat(50)}`);

    expect(slug.length).toBeLessThanOrEqual(200);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('buildSlug', () => {
  it('appends an 8 character hex suffix', () => {
    expect(buildSlug('My Title')).toMatch(/^my-title-[0-9a-f]{8}$/);
  });

  it('differs between calls for the same title', () => {
    expect(buildSlug('My Title')).not.toBe(buildSlug('My Title'));
  });

  it('stays within the slug column length', () => {
    expect(buildSlug('x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});
