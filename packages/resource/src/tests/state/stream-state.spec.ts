import { describe, expect, it } from 'vitest';
import { StreamStateFactory } from '../../lib/state/stream-state/stream-state.factory.js';
import { Entity } from '../../lib/index.js';
import { ClientInstance } from '../../lib/client-instance.js';

describe('StreamState', async () => {
  const streamData = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('Hello, '));
      controller.enqueue(encoder.encode('this is '));
      controller.enqueue(encoder.encode('a stream!'));
      controller.close();
    },
  });

  const factory: StreamStateFactory = new StreamStateFactory();
  const state = await factory.create<Entity<ReadableStream>>(
    {} as ClientInstance,
    { rel: '', context: '', href: '/stream' },
    new Response(streamData, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': '21',
        Link: '<https://api.example.com/stream/1>; rel="self"; type="application/octet-stream"; title="Stream Data"',
      },
    }),
  );

  it('should get stream data', async () => {
    const reader = state.data.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    expect(result).toEqual('Hello, this is a stream!');
  });

  it('should get link from header', () => {
    expect(state.getLink('self')).toEqual({
      rel: 'self',
      href: 'https://api.example.com/stream/1',
      type: 'application/octet-stream',
      title: 'Stream Data',
    });
  });

  it('should have correct content type', () => {
    const contentHeaders = state.contentHeaders();
    expect(contentHeaders.get('content-type')).toBe('application/octet-stream');
  });
});
