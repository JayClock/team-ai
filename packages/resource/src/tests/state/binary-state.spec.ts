import { BinaryStateFactory } from '../../lib/state/binary-state/binary-state.factory.js';
import { Entity } from '../../lib/index.js';
import { ClientInstance } from '../../lib/client-instance.js';

describe('Binary State', async () => {
  const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);

  const factory = new BinaryStateFactory();
  const state = await factory.create<Entity<Blob>>(
    {} as ClientInstance,
    {
      rel: '',
      context: '',
      href: '/binary',
    },
    new Response(binaryData, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': binaryData.length.toString(),
        Link: '<https://api.example.com/users/1>; rel="self"; type="application/json"; hreflang="en"; title="User Profile"',
      },
    }),
  );

  it('should get binary data', async () => {
    expect(await state.data.text()).toEqual('Hello');
  });

  it('should get link form header', () => {
    expect(state.getLink('self')).toEqual({
      rel: 'self',
      href: 'https://api.example.com/users/1',
      type: 'application/json',
      hreflang: 'en',
      title: 'User Profile',
    });
  });
});
