import { Links } from '../links/links.js';
import { Link, NewLink } from '../links/link.js';
import LinkHeader from 'http-link-header';

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

export function parseHeaderLink(
  context: string,
  headers: Headers,
): Links<Record<string, Link>> {
  const result = new Links(context);
  const header = headers.get('Link');
  if (!header) {
    return result;
  }

  for (const httpLink of LinkHeader.parse(header).refs) {
    // Looping through individual links
    for (const rel of httpLink.rel.split(' ')) {
      // Looping through space separated rel values.
      const link: NewLink = {
        rel: rel,
        href: httpLink.uri,
        title: httpLink.title,
        hreflang: httpLink.hreflang,
        type: httpLink.type,
      };
      result.set(link);
    }
  }
  return result;
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

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

const safeMethods = [
  'GET',
  'HEAD',
  'OPTIONS',
  'PRI',
  'PROPFIND',
  'REPORT',
  'SEARCH',
  'TRACE',
];

export function isSafeMethod(method: string): boolean {
  return safeMethods.includes(method);
}
