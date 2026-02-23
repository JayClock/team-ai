import { HalLink, HalResource } from 'hal-types';
import { NewLink } from '../../links/link.js';

/**
 * Parse the Hal _links object and populate the 'links' property.
 */
export function parseHalLinks(
  halLinks: HalResource['_links'],
  embedded?: HalResource['_embedded'],
): NewLink[] {
  const result: NewLink[] = [];

  const foundLinks = new Set<string>();

  for (const [relType, links] of Object.entries(halLinks ?? {})) {
    const linkList = (Array.isArray(links) ? links : [links]).filter(
      (link): link is HalLink => link !== undefined,
    );

    for (const link of linkList) {
      foundLinks.add(relType + ';' + link.href);
    }

    result.push(...parseHalLink(relType, linkList));
  }

  for (const [rel, innerBodies] of Object.entries(embedded ?? {})) {
    for (const innerBody of Array.isArray(innerBodies)
      ? innerBodies
      : [innerBodies]) {
      const href = (innerBody?._links?.self as HalLink)?.href;
      if (!href) {
        continue;
      }
      if (foundLinks.has(rel + ';' + href)) {
        continue;
      }
      result.push({
        rel,
        href,
      });
    }
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
