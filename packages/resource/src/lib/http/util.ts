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
  headers: Headers
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

/**
 * Resolves a relative url using another url.
 *
 * This is the node.js version.
 */
export function resolve(base: string, relative: string): string;
export function resolve(link: Link): string;
export function resolve(arg1: string | Link, arg2?: string): string {
  // Normalize the 2 calling conventions
  let base, relative;
  if (typeof arg1 === 'string') {
    base = arg1;
    relative = arg2 as string;
  } else {
    base = arg1.context;
    relative = arg1.href;
  }

  // Our resolve function allows both parts to be relative, and new URL
  // requires the second argument to be absolute, so we wil use the RFC6761
  // 'invalid' domain as a base, so we can later strip it out.
  const newUrl = new URL(relative, new URL(base, 'http://resource.invalid'));

  if (newUrl.hostname === 'resource.invalid') {
    // Make the URL relative again if it contained 'resource.invalid'
    return newUrl.pathname + newUrl.search + newUrl.hash;
  } else if (base.startsWith('//')) {
    // if the 'base' started with `//` it means it's a protocol-relative URL.
    // We want to make sure we retain that and don't accidentally add the `http`
    // from resource.invalid
    return '//' + newUrl.host + newUrl.pathname + newUrl.search + newUrl.hash;
  } else {
    return newUrl.toString();
  }
}
