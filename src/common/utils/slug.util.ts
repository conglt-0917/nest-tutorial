import { randomBytes } from 'node:crypto';

const SLUG_BASE_MAX_LENGTH = 200;
const SLUG_SUFFIX_BYTES = 4;
const FALLBACK_SLUG = 'article';

export function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug || FALLBACK_SLUG;
}

export function buildSlug(title: string): string {
  return `${slugify(title)}-${randomBytes(SLUG_SUFFIX_BYTES).toString('hex')}`;
}
