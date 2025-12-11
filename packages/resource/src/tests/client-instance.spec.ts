import { ClientInstance } from '../lib/client-instance.js';
import { Fetcher } from '../lib/http/fetcher.js';
import { Config } from '../lib/archtype/config.js';
import { StateFactory } from '../lib/state/state.js';
import { LinkResource } from '../lib/resource/link-resource.js';
const mockFetcher = {} as Fetcher;
const mockConfig = { baseURL: 'bookmarkUri' } as Config;
const mockHalStateFactory = {
  create: vi.fn(),
} as StateFactory;
const mockBinaryStateFactory = {
  create: vi.fn(),
} as StateFactory;
describe('ClientInstance', () => {
  const clientInstance = new ClientInstance(
    mockFetcher,
    mockConfig,
    mockHalStateFactory,
    mockBinaryStateFactory
  );

  it('should set bookmarkUri with config baseURL', () => {
    expect(clientInstance.bookmarkUri).toEqual(mockConfig.baseURL);
  });

  it('should go to link resource', () => {
    expect(clientInstance.go({ rel: 'rel', href: 'href' })).toBeInstanceOf(
      LinkResource
    );
  });

  describe('generate binary state', () => {
    it('should generate binary state when content-type is not existed', () => {
      clientInstance.getStateForResponse(
        '',
        new Response(null, { headers: { 'Content-Type': '' } })
      );
      expect(mockBinaryStateFactory.create).toHaveBeenCalled();
    });

    it('should generate binary state when status is 204', () => {
      clientInstance.getStateForResponse(
        '',
        new Response(null, { status: 204 })
      );
      expect(mockBinaryStateFactory.create).toHaveBeenCalled();
    });
  });

  describe('generate hal state', () => {
    it('should generate hal state when content-type application/prs.hal-forms+json', () => {
      clientInstance.getStateForResponse(
        '',
        new Response(null, {
          headers: { 'Content-Type': 'application/prs.hal-forms+json' },
        })
      );
      expect(mockHalStateFactory.create).toHaveBeenCalled();
    });

    it('should generate hal state when content-type application/hal+json', () => {
      clientInstance.getStateForResponse(
        '',
        new Response(null, {
          headers: { 'Content-Type': 'application/hal+json' },
        })
      );
      expect(mockHalStateFactory.create).toHaveBeenCalled();
    });

    it('should generate hal state when content-type application/json', () => {
      clientInstance.getStateForResponse(
        '',
        new Response(null, {
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(mockHalStateFactory.create).toHaveBeenCalled();
    });

    it('should generate hal state when content-type match /^application\\/[A-Za-z-.]+\\+json/', () => {
      clientInstance.getStateForResponse(
        '',
        new Response(null, {
          headers: { 'Content-Type': 'application/geo+json' },
        })
      );
      expect(mockHalStateFactory.create).toHaveBeenCalled();
    });
  });
});
