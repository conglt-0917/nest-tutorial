import { applyDecorators, Header } from '@nestjs/common';

/**
 * Marks a response as never cacheable, by browsers, proxies or HTTP/1.0 caches.
 * Use it on every response that carries tokens or personal data.
 */
export const NoCache = () =>
  applyDecorators(
    Header('Cache-Control', 'no-store, no-cache, must-revalidate'),
    Header('Pragma', 'no-cache'),
    Header('Expires', '0'),
  );
