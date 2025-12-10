/**
 * Takes a Content-Type header, and only returns the mime-type part.
 */
export function parseContentType(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }
  if (contentType.includes(';')) {
    contentType = contentType.split(';')[0];
  }
  return contentType.trim();
}

/**
 * Older HTTP versions calls these 'entity headers'.
 *
 * Never HTTP/1.1 specs calls some of these 'representation headers'.
 *
 * What they have in common is that these headers can exist on request and
 * response and say something *about* the content.
 */
export const entityHeaderNames = [
  'Content-Type',
  'Content-Language',
  'Content-Location',
  'Deprecation',
  'ETag',
  'Expires',
  'Last-Modified',
  'Sunset',
  'Title',
  'Warning',
];
