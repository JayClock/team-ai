import { HalLink, HalResource } from 'hal-types';
import { NewLink } from '../../links/link.js';

/**
 * Parse the Hal _links object and populate the 'links' property.
 */
export function parseHalLinks(
  halLinks: HalResource['_links']
): NewLink[] {
  if (halLinks === undefined) {
    return [];
  }

  const result: NewLink[] = [];

  const foundLinks = new Set();

  for (const [relType, links] of Object.entries(halLinks)) {
    const linkList = Array.isArray(links) ? links : [links];

    for (const link of linkList) {
      foundLinks.add(relType + ';' + link.href);
    }

    result.push(...parseHalLink(relType, linkList));
  }

  return result;
}

/**
 * Parses a single HAL link from a _links object
 */
function parseHalLink(rel: string, links: HalLink[]): NewLink[] {
  const result: NewLink[] = [];

  for (const link of links) {
    result.push({
      rel,
      ...link,
    });
  }

  return result;
}
