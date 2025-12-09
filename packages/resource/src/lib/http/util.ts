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
