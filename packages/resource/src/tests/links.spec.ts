import { describe, expect } from 'vitest';
import { Links } from '../lib/links/links.js';
import { Link } from '../lib/links/link.js';

describe('Links', () => {
  const links = new Links<Record<string, Link>>();

  it('should get single stored link', () => {
    const link: Link = { rel: 'rel', href: 'href' };
    links.add([link]);
    expect(links.get('rel')).toEqual(link);
  });
});
