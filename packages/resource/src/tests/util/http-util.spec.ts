import { parseHeaderLink } from '../../lib/http/util.js';

describe('parseHeaderLink', () => {
  it('should preserve multiple links with the same rel', () => {
    const headers = new Headers({
      Link: '</users/1>; rel="item", </users/2>; rel="item"',
    });

    const links = parseHeaderLink('https://api.example.com', headers);

    expect(links.getMany('item')).to.have.length(2);
    expect(links.getMany('item')[0]?.href).to.equal('/users/1');
    expect(links.getMany('item')[1]?.href).to.equal('/users/2');
  });
});
