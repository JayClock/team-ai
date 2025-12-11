import { describe, expect } from 'vitest';
import { Links } from '../lib/links/links.js';
import { Link } from '../lib/links/link.js';

describe('Links', () => {
  let links: Links<Record<string, Link>>;
  beforeEach(() => {
    links = new Links<Record<string, Link>>();
  });

  it('should add multi links', () => {
    const link1: Link = { rel: 'rel1', href: 'href1' };
    const link2: Link = { rel: 'rel2', href: 'href2' };
    links.add([link1, link2]);
    expect(links.get('rel1')).toEqual(link1);
    expect(links.get('rel2')).toEqual(link2);
  });

  it('should set single link and instead exist link', () => {
    const link1: Link = { rel: 'rel', href: 'href1' };
    const link2: Link = { rel: 'rel', href: 'href2' };
    links.add([link1]);
    links.set(link2);
    expect(links.get('rel')).toEqual(link2);
  });

  it('should get multiple links', () => {
    const link1: Link = { rel: 'rel', href: 'href1' };
    const link2: Link = { rel: 'rel', href: 'href2' };
    const link3: Link = { rel: 'rel3', href: 'href3' };
    links.add([link1, link2, link3]);
    expect(links.getMany('rel')).toEqual([link1, link2]);
    expect(links.getMany('rel3')).toEqual([link3]);
    expect(links.getMany('not existed')).toEqual([]);
  });

  it('should get all links', () => {
    const link1: Link = { rel: 'rel', href: 'href1' };
    const link2: Link = { rel: 'rel', href: 'href2' };
    const link3: Link = { rel: 'rel3', href: 'href3' };
    links.add([link1, link2, link3]);
    expect(links.getAll()).toEqual([link1, link2, link3]);
  });

  it('It should be determined whether a link exists', () => {
    const link: Link = { rel: 'rel', href: 'href1' };
    links.add([link]);
    expect(links.has('rel')).toBeTruthy();
    expect(links.has('not existed')).toBeFalsy();
  });
});
