import { SafeAny } from '../../archtype/safe-any.js';
import { HalResource } from 'hal-types';
import { Links } from '../../links/links.js';

export function parseHalLinks<TLinks extends Record<string, SafeAny>>(
  halLinks: HalResource['_links']
): Links<TLinks> {
  const links = new Links<TLinks>();
  for (const [key, value] of Object.entries(halLinks ?? [])) {
    const linkList = Array.isArray(value) ? value : [value];
    links.add(
      linkList.map((item) => ({
        ...item,
        rel: key,
        type: item.type ?? 'GET'
      }))
    );
  }
  return links;
}
