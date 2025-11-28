import { describe, expect } from 'vitest';
import { Link, Links } from '../lib/links.js';

describe('Links', () => {
  const links = new Links();

  it('should get single stored link', () => {
    const link: Link = { rel: 'rel', href: 'href' };
    links.add([link]);
    expect(links.get('rel')).toEqual(link);
  });
});
