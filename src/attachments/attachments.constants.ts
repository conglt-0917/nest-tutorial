export const ATTACHABLE_TYPE = {
  USER: 'user',
} as const;

export const ATTACHMENT_KIND = {
  AVATAR: 'avatar',
} as const;

export const ATTACHMENTS_ROUTE = 'attachments';

export const AVATAR_FIELD = 'avatar';
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export const AVATAR_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export const FILE_NAME_MAX_LENGTH = 255;

export const ATTACHMENT_CACHE_CONTROL = 'private, max-age=86400';

export const FILE_NOT_FOUND_CODE = 'ENOENT';
