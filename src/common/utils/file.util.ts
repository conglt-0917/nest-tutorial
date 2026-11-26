const FALLBACK_FILE_NAME = 'file';

export function sanitizeFileName(
  name: string | undefined,
  maxLength: number,
): string {
  const lastSegment = (name ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = Array.from(lastSegment)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f && char !== '"';
    })
    .join('')
    .trim();
  return Array.from(cleaned).slice(0, maxLength).join('') || FALLBACK_FILE_NAME;
}
