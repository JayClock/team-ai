import { beforeEach, describe, expect, vi } from 'vitest';
import { BaseState } from '../../lib/state/base-state.js';
import { Links } from '../../lib/links/links.js';
import { Link } from '../../lib/links/link.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { Form } from '../../lib/form/form.js';
import { StateCollection } from '../../lib/state/state-collection.js';
import { Entity } from '../../lib/index.js';

const mockClient = {
  bookmarkUri: 'https://example.com/',
  go: vi.fn(),
} as unknown as ClientInstance;

type TestEntity = Entity<
  {
    id: string;
    name: string;
  },
  {
    self: TestEntity;
    related: TestEntity;
    edit: TestEntity;
  }
>;

describe('BaseState', () => {
  let mockLinks: Links<TestEntity['links']>;
  let mockHeaders: Headers;
  let mockForms: Form[];
  let currentLink: Link;
  let testData: TestEntity['data'];
  let state: BaseState<TestEntity>;

  beforeEach(() => {
    // Setup test data
    testData = {
      id: '123',
      name: 'Test Resource',
    };

    currentLink = {
      rel: 'self',
      href: '/api/resources/123',
      context: mockClient.bookmarkUri,
    };

    mockLinks = new Links<TestEntity['links']>(mockClient.bookmarkUri, [
      {
        rel: 'self',
        href: '/api/resources/123',
      },
      {
        rel: 'related',
        href: '/api/resources/124',
      },
      {
        rel: 'edit',
        href: '/api/resources/123/edit',
      },
    ]);

    mockHeaders = new Headers({
      'Content-Type': 'application/json',
      'Content-Language': 'en',
      ETag: '"abc123"',
      'Cache-Control': 'max-age=3600',
      Expires: 'Wed, 21 Oct 2025 07:28:00 GMT',
    });

    mockForms = [
      {
        uri: '/api/resources/123/edit',
        method: 'PUT',
        contentType: 'application/json',
        fields: [],
      },
      {
        uri: '/api/resources/123/delete',
        method: 'DELETE',
        contentType: 'application/json',
        fields: [],
      },
    ];

    state = new BaseState<TestEntity>({
      client: mockClient,
      data: testData,
      links: mockLinks,
      headers: mockHeaders,
      currentLink,
      forms: mockForms,
    });
  });

  describe('constructor and basic properties', () => {
    it('should initialize with correct properties', () => {
      expect(state.uri).toBe('https://example.com/api/resources/123');
      expect(state.client).toBe(mockClient);
      expect(state.data).toEqual(testData);
      expect(state.links).toBe(mockLinks);
      expect(state.timestamp).toBeLessThanOrEqual(Date.now());
      expect(state.collection).toEqual([]);
    });

    it('should accept collection parameter', () => {
      const mockCollection = [
        state,
        state,
      ] as unknown as StateCollection<TestEntity>;
      const stateWithCollection = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
        collection: mockCollection,
      });

      expect(stateWithCollection.collection).toEqual(mockCollection);
    });

    it('should initialize with empty forms array if not provided', () => {
      const stateWithoutForms = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      expect(stateWithoutForms['forms']).toEqual([]);
    });

    it('should initialize with empty embedded state if not provided', () => {
      const stateWithoutEmbedded = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      expect(stateWithoutEmbedded['embeddedState']).toEqual({});
    });
  });

  describe('hasLink', () => {
    it('should return true for existing links', () => {
      expect(state.hasLink('self')).toBe(true);
      expect(state.hasLink('related')).toBe(true);
      expect(state.hasLink('edit')).toBe(true);
    });

    it('should return false for non-existing links', () => {
      expect(state.hasLink('prev' as never)).toBe(false);
      expect(state.hasLink('unknown' as never)).toBe(false);
    });
  });

  describe('getLink', () => {
    it('should return the link for existing rel', () => {
      const selfLink = state.getLink('self');
      expect(selfLink).toBeDefined();
      expect(selfLink?.href).toBe('/api/resources/123');

      const relatedLink = state.getLink('related');
      expect(relatedLink).toBeDefined();
      expect(relatedLink?.href).toBe('/api/resources/124');
    });

    it('should return undefined for non-existing rel', () => {
      const unknownLink = state.getLink('unknown' as never);
      expect(unknownLink).toBeUndefined();
    });
  });

  describe('serializeBody', () => {
    it('should return string directly if data is a string', () => {
      const stringData = 'plain text content' as unknown as TestEntity['data'];
      const stringState = new BaseState<TestEntity>({
        client: mockClient,
        data: stringData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      expect(stringState.serializeBody()).toBe('plain text content');
    });

    it('should return data directly if it is a Buffer', () => {
      const buffer = Buffer.from(
        'buffer content',
      ) as unknown as TestEntity['data'];
      const bufferState = new BaseState<TestEntity>({
        client: mockClient,
        data: buffer,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      expect(bufferState.serializeBody()).toBe(buffer);
    });

    it('should return data directly if it is a Blob', () => {
      const blob = new Blob(['blob content']) as unknown as TestEntity['data'];
      const blobState = new BaseState<TestEntity>({
        client: mockClient,
        data: blob,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      expect(blobState.serializeBody()).toBe(blob);
    });

    it('should JSON stringify object data', () => {
      const serialized = state.serializeBody() as string;
      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(testData);
    });

    it('should handle complex nested objects', () => {
      const complexData = {
        id: '123',
        nested: {
          field1: 'value1',
          field2: [1, 2, 3],
        },
      } as unknown as TestEntity['data'];

      const complexState = new BaseState<TestEntity>({
        client: mockClient,
        data: complexData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      const serialized = complexState.serializeBody() as string;
      const parsed = JSON.parse(serialized);

      expect(parsed).toEqual(complexData);
    });
  });

  describe('contentHeaders', () => {
    it('should filter entity headers from response headers', () => {
      const contentHeaders = state.contentHeaders();

      expect(contentHeaders).toBeInstanceOf(Headers);
      expect(contentHeaders.get('Content-Type')).toBe('application/json');
      expect(contentHeaders.get('Content-Language')).toBe('en');
      expect(contentHeaders.get('ETag')).toBe('"abc123"');
      expect(contentHeaders.get('Expires')).toBe(
        'Wed, 21 Oct 2025 07:28:00 GMT',
      );
    });

    it('should not include non-entity headers', () => {
      const contentHeaders = state.contentHeaders();

      expect(contentHeaders.get('Cache-Control')).toBeNull();
    });

    it('should return empty Headers if no entity headers exist', () => {
      const emptyHeaders = new Headers();
      const stateWithEmptyHeaders = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: emptyHeaders,
        currentLink,
      });

      const contentHeaders = stateWithEmptyHeaders.contentHeaders();
      expect([...contentHeaders.entries()].length).toBe(0);
    });

    it('should include all entity header names', () => {
      const allHeaders = new Headers({
        'Content-Type': 'application/json',
        'Content-Language': 'en',
        'Content-Location': '/api/resource/123',
        Deprecation: 'true',
        ETag: '"abc123"',
        Expires: 'Wed, 21 Oct 2025 07:28:00 GMT',
        'Last-Modified': 'Mon, 15 Sep 2024 12:00:00 GMT',
        Sunset: 'Wed, 21 Oct 2026 07:28:00 GMT',
        Title: 'API Resource',
        Warning: '299 - "Deprecated"',
      });

      const stateWithAllHeaders = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: allHeaders,
        currentLink,
      });

      const contentHeaders = stateWithAllHeaders.contentHeaders();
      expect([...contentHeaders.entries()].length).toBe(10);
    });
  });

  describe('follow', () => {
    it('should call client.go with the correct link and current uri', () => {
      state.follow('related');

      expect(mockClient.go).toHaveBeenCalledWith(
        mockLinks.get('related'),
        state.uri,
      );
    });

    it('should throw error if link does not exist', () => {
      expect(() => state.follow('unknown' as never)).toThrow(
        'rel unknown is not exited',
      );
    });

    it('should return the result from client.go', () => {
      const mockResource = {} as never;
      vi.mocked(mockClient.go).mockReturnValue(mockResource);

      const result = state.follow('edit');

      expect(result).toBe(mockResource);
    });

    describe('pagination links with collection', () => {
      type CollectionEntity = Entity<
        { id: string },
        {
          self: CollectionEntity;
          first: CollectionEntity;
          last: CollectionEntity;
          prev: CollectionEntity;
          next: CollectionEntity;
          item: CollectionEntity;
        }
      >;

      let collectionLinks: Links<CollectionEntity['links']>;
      let collectionState: BaseState<CollectionEntity>;
      let mockCollection: StateCollection<CollectionEntity>;

      beforeEach(() => {
        mockCollection = [
          new BaseState<CollectionEntity>({
            client: mockClient,
            data: { id: '1' },
            links: mockLinks,
            headers: mockHeaders,
            currentLink: { rel: 'item', href: '/api/items/1', context: mockClient.bookmarkUri },
          }),
        ] as StateCollection<CollectionEntity>;

        collectionLinks = new Links<CollectionEntity['links']>(mockClient.bookmarkUri, [
          { rel: 'self', href: '/api/items?page=1' },
          { rel: 'first', href: '/api/items?page=1' },
          { rel: 'last', href: '/api/items?page=10' },
          { rel: 'prev', href: '/api/items?page=2' },
          { rel: 'next', href: '/api/items?page=2' },
          { rel: 'item', href: '/api/items/1' },
        ]);

        collectionState = new BaseState<CollectionEntity>({
          client: mockClient,
          data: { id: '1' },
          links: collectionLinks,
          headers: mockHeaders,
          currentLink: { rel: 'item', href: '/api/items/1', context: mockClient.bookmarkUri },
          collection: mockCollection,
        });
      });

      it('should replace rel with currentLink.rel for "self" when collection has items', () => {
        collectionState.follow('self');

        const expectedLink = { ...collectionLinks.get('self')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink, collectionState.uri);
      });

      it('should replace rel with currentLink.rel for "first" when collection has items', () => {
        collectionState.follow('first');

        const expectedLink = { ...collectionLinks.get('first')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink, collectionState.uri);
      });

      it('should replace rel with currentLink.rel for "last" when collection has items', () => {
        collectionState.follow('last');

        const expectedLink = { ...collectionLinks.get('last')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink, collectionState.uri);
      });

      it('should replace rel with currentLink.rel for "prev" when collection has items', () => {
        collectionState.follow('prev');

        const expectedLink = { ...collectionLinks.get('prev')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink, collectionState.uri);
      });

      it('should replace rel with currentLink.rel for "next" when collection has items', () => {
        collectionState.follow('next');

        const expectedLink = { ...collectionLinks.get('next')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink, collectionState.uri);
      });

      it('should not replace rel for non-pagination links even when collection has items', () => {
        collectionState.follow('item');

        expect(mockClient.go).toHaveBeenCalledWith(
          collectionLinks.get('item'),
          collectionState.uri,
        );
      });

      it('should not replace rel for pagination links when collection is empty', () => {
        const emptyCollectionState = new BaseState<CollectionEntity>({
          client: mockClient,
          data: { id: '1' },
          links: collectionLinks,
          headers: mockHeaders,
          currentLink: { rel: 'item', href: '/api/items/1', context: mockClient.bookmarkUri },
          collection: [],
        });

        emptyCollectionState.follow('self');

        expect(mockClient.go).toHaveBeenCalledWith(
          collectionLinks.get('self'),
          emptyCollectionState.uri,
        );
      });
    });
  });

  describe('getForm', () => {
    it('should return the form matching rel and method', () => {
      const form = state.getForm('edit', 'PUT');

      expect(form).toBeDefined();
      expect(form?.method).toBe('PUT');
      expect(form?.uri).toBe('/api/resources/123/edit');
    });

    it('should default to GET method if not specified', () => {
      const getForm = {
        uri: '/api/resources/123',
        method: 'GET' as const,
        contentType: 'application/json',
        fields: [],
      };

      const stateWithGetForm = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
        forms: [getForm],
      });

      const form = stateWithGetForm.getForm('self');
      expect(form).toBe(getForm);
    });

    it('should return undefined if link does not exist', () => {
      const form = state.getForm('unknown' as never, 'GET');
      expect(form).toBeUndefined();
    });

    it('should return undefined if no form matches the uri and method', () => {
      const form = state.getForm('self', 'POST');
      expect(form).toBeUndefined();
    });

    it('should match different forms for the same link by method', () => {
      const formsForSameLink = [
        {
          uri: '/api/resources/123/edit',
          method: 'PUT' as const,
          contentType: 'application/json',
          fields: [],
        },
        {
          uri: '/api/resources/123/edit',
          method: 'PATCH' as const,
          contentType: 'application/json',
          fields: [],
        },
        {
          uri: '/api/resources/123/edit',
          method: 'DELETE' as const,
          contentType: 'application/json',
          fields: [],
        },
      ];

      const stateWithMultipleForms = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
        forms: formsForSameLink,
      });

      const putForm = stateWithMultipleForms.getForm('edit', 'PUT');
      const patchForm = stateWithMultipleForms.getForm('edit', 'PATCH');
      const deleteForm = stateWithMultipleForms.getForm('edit', 'DELETE');

      expect(putForm?.method).toBe('PUT');
      expect(patchForm?.method).toBe('PATCH');
      expect(deleteForm?.method).toBe('DELETE');

      expect(putForm?.uri).toBe('/api/resources/123/edit');
      expect(patchForm?.uri).toBe('/api/resources/123/edit');
      expect(deleteForm?.uri).toBe('/api/resources/123/edit');
    });
  });

  describe('getEmbedded', () => {
    it('should return embedded state for existing rel', () => {
      const mockEmbeddedState = {
        self: {} as TestEntity,
        related: {} as TestEntity,
        edit: {} as TestEntity,
      };

      const stateWithEmbedded = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
        embeddedState: mockEmbeddedState,
      });

      expect(stateWithEmbedded.getEmbedded('related')).toBe(
        mockEmbeddedState.related,
      );
    });

    it('should return undefined for non-existing embedded rel', () => {
      expect(state.getEmbedded('unknown' as never)).toBeUndefined();
    });

    it('should return undefined if no embedded state exists', () => {
      const stateWithoutEmbedded = new BaseState<TestEntity>({
        client: mockClient,
        data: testData,
        links: mockLinks,
        headers: mockHeaders,
        currentLink,
      });

      expect(stateWithoutEmbedded.getEmbedded('any' as never)).toBeUndefined();
    });
  });

  describe('clone', () => {
    it('should create a new State instance', () => {
      const cloned = state.clone();

      expect(cloned).toBeInstanceOf(BaseState);
      expect(cloned).not.toBe(state);
    });

    it('should have the same uri', () => {
      const cloned = state.clone();
      expect(cloned.uri).toEqual(state.uri);
    });

    it('should have the same data', () => {
      const cloned = state.clone();
      expect(cloned.data).toEqual(state.data);
    });

    it('should reference the same data object (shallow clone)', () => {
      const cloned = state.clone();
      expect(cloned.data).toBe(state.data);
    });

    it('should have the same timestamp', () => {
      const cloned = state.clone();
      expect(cloned.timestamp).toBe(state.timestamp);
    });
  });
});
