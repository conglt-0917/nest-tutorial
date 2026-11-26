import { sanitizeFileName } from './file.util.js';

describe('sanitizeFileName', () => {
  it.each([
    ['avatar.png', 'avatar.png'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\photo.jpg', 'photo.jpg'],
    ['a"b\u0000c\nd.png', 'abcd.png'],
    ['  ảnh đại diện.png  ', 'ảnh đại diện.png'],
    ['', 'file'],
    [undefined, 'file'],
    ['../', 'file'],
  ])('%j becomes %j', (input, expected) => {
    expect(sanitizeFileName(input, 255)).toBe(expected);
  });

  it('truncates to the maximum length', () => {
    expect(sanitizeFileName('a'.repeat(300), 255)).toHaveLength(255);
  });

  it('does not cut a multi-byte character in half', () => {
    expect(sanitizeFileName('ảnh.png', 2)).toBe('ản');
  });

  it('removes the DEL character', () => {
    expect(sanitizeFileName('a\u007fb.png', 255)).toBe('ab.png');
  });
});
