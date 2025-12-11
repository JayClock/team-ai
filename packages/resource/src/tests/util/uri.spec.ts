import { resolve } from '../../lib/util/uri.js';

describe('resolve', () => {
  it('should be able to resolve relative links from a Link object', () => {
    const link = {
      rel: 'about',
      context: 'https://example.org/',
      href: '/foo/bar',
    };

    expect(resolve(link)).to.equal('https://example.org/foo/bar');
  });
  it('should be able to resolve relative links strings', () => {
    const base = 'https://example.org/';
    const relative = '/foo/bar';

    expect(resolve(base, relative)).to.equal('https://example.org/foo/bar');
  });
});
