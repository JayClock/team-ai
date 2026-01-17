import { beforeEach, describe, expect, vi } from 'vitest';
import { BaseState } from '../../lib/state/base-state.js';
import { Links } from '../../lib/links/links.js';
import { Link } from '../../lib/links/link.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { Form } from '../../lib/form/form.js';
import { StateCollection } from '../../lib/state/state-collection.js';
import { Entity } from '../../lib/index.js';
import { SafeAny } from '../../lib/archtype/safe-any.js';

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
        name: 'edit',
        method: 'PUT',
        contentType: 'application/json',
        fields: [],
      },
      {
        uri: '/api/resources/123/delete',
        name: 'delete',
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
            links: mockLinks as SafeAny,
            headers: mockHeaders,
            currentLink: {
              rel: 'item',
              href: '/api/items/1',
              context: mockClient.bookmarkUri,
            },
          }),
        ] as unknown as StateCollection<CollectionEntity>;

        collectionLinks = new Links<CollectionEntity['links']>(
          mockClient.bookmarkUri,
          [
            { rel: 'self', href: '/api/items?page=1' },
            { rel: 'first', href: '/api/items?page=1' },
            { rel: 'last', href: '/api/items?page=10' },
            { rel: 'prev', href: '/api/items?page=2' },
            { rel: 'next', href: '/api/items?page=2' },
            { rel: 'item', href: '/api/items/1' },
          ],
        );

        collectionState = new BaseState<CollectionEntity>({
          client: mockClient,
          data: { id: '1' },
          links: collectionLinks,
          headers: mockHeaders,
          currentLink: {
            rel: 'item',
            href: '/api/items/1',
            context: mockClient.bookmarkUri,
          },
          collection: mockCollection,
        });
      });

      it('should replace rel with currentLink.rel for "self" when collection has items', () => {
        collectionState.follow('self');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const expectedLink = { ...collectionLinks.get('self')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink);
      });

      it('should replace rel with currentLink.rel for "first" when collection has items', () => {
        collectionState.follow('first');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const expectedLink = { ...collectionLinks.get('first')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink);
      });

      it('should replace rel with currentLink.rel for "last" when collection has items', () => {
        collectionState.follow('last');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const expectedLink = { ...collectionLinks.get('last')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink);
      });

      it('should replace rel with currentLink.rel for "prev" when collection has items', () => {
        collectionState.follow('prev');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const expectedLink = { ...collectionLinks.get('prev')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink);
      });

      it('should replace rel with currentLink.rel for "next" when collection has items', () => {
        collectionState.follow('next');

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const expectedLink = { ...collectionLinks.get('next')!, rel: 'item' };
        expect(mockClient.go).toHaveBeenCalledWith(expectedLink);
      });

      it('should not replace rel for non-pagination links even when collection has items', () => {
        collectionState.follow('item');

        expect(mockClient.go).toHaveBeenCalledWith(collectionLinks.get('item'));
      });

      it('should not replace rel for pagination links when collection is empty', () => {
        const emptyCollectionState = new BaseState<CollectionEntity>({
          client: mockClient,
          data: { id: '1' },
          links: collectionLinks,
          headers: mockHeaders,
          currentLink: {
            rel: 'item',
            href: '/api/items/1',
            context: mockClient.bookmarkUri,
          },
          collection: [],
        });

        emptyCollectionState.follow('self');

        expect(mockClient.go).toHaveBeenCalledWith(collectionLinks.get('self'));
      });
    });
  });

  describe('hasActionFor', () => {
    it('should return true when action exists for link relation', () => {
      expect(state.hasActionFor('edit')).toBe(true);
    });

    it('should return false when link does not exist', () => {
      expect(state.hasActionFor('nonexistent' as never)).toBe(false);
    });

    it('should return false when link exists but no matching form', () => {
      expect(state.hasActionFor('self')).toBe(false);
    });

    it('should return true when matching method is specified', () => {
      expect(state.hasActionFor('edit', 'PUT')).toBe(true);
    });

    it('should return false when non-matching method is specified', () => {
      expect(state.hasActionFor('edit', 'DELETE')).toBe(false);
    });

    it('should return true when multiple actions exist and one matches method', () => {
      const multiMethodLinks = new Links<SafeAny>(mockClient.bookmarkUri, [
        { rel: 'item', href: '/api/items/1' },
      ]);
      const multiMethodForms: Form[] = [
        {
          uri: '/api/items/1',
          name: 'update',
          method: 'PUT',
          contentType: 'application/json',
          fields: [],
        },
        {
          uri: '/api/items/1',
          name: 'remove',
          method: 'DELETE',
          contentType: 'application/json',
          fields: [],
        },
      ];
      const multiMethodState = new BaseState<SafeAny>({
        client: mockClient,
        data: {},
        links: multiMethodLinks,
        headers: mockHeaders,
        currentLink,
        forms: multiMethodForms,
      });

      expect(multiMethodState.hasActionFor('item')).toBe(true);
      expect(multiMethodState.hasActionFor('item', 'PUT')).toBe(true);
      expect(multiMethodState.hasActionFor('item', 'DELETE')).toBe(true);
      expect(multiMethodState.hasActionFor('item', 'POST')).toBe(false);
    });
  });

  describe('actionFor', () => {
    it('should return action for matching link relation', () => {
      const action = state.actionFor('edit');

      expect(action).toBeDefined();
      expect(action.method).toBe('PUT');
      expect(action.uri).toBe('/api/resources/123/edit');
    });

    it('should throw ActionNotFound when link does not exist', () => {
      expect(() => state.actionFor('nonexistent' as never)).toThrow(
        "Link relation 'nonexistent' not found",
      );
    });

    it('should throw ActionNotFound when link exists but no matching form', () => {
      expect(() => state.actionFor('self')).toThrow(
        "No action found for link 'self' (href: /api/resources/123)",
      );
    });

    it('should return action matching specified method', () => {
      const multiMethodLinks = new Links<SafeAny>(mockClient.bookmarkUri, [
        { rel: 'item', href: '/api/items/1' },
      ]);
      const multiMethodForms: Form[] = [
        {
          uri: '/api/items/1',
          name: 'update',
          method: 'PUT',
          contentType: 'application/json',
          fields: [],
        },
        {
          uri: '/api/items/1',
          name: 'remove',
          method: 'DELETE',
          contentType: 'application/json',
          fields: [],
        },
      ];
      const multiMethodState = new BaseState<SafeAny>({
        client: mockClient,
        data: {},
        links: multiMethodLinks,
        headers: mockHeaders,
        currentLink,
        forms: multiMethodForms,
      });

      const putAction = multiMethodState.actionFor('item', 'PUT');
      expect(putAction.method).toBe('PUT');
      expect(putAction.name).toBe('update');

      const deleteAction = multiMethodState.actionFor('item', 'DELETE');
      expect(deleteAction.method).toBe('DELETE');
      expect(deleteAction.name).toBe('remove');
    });

    it('should throw AmbiguousActionError when multiple actions match and no method specified', () => {
      const multiMethodLinks = new Links<SafeAny>(mockClient.bookmarkUri, [
        { rel: 'item', href: '/api/items/1' },
      ]);
      const multiMethodForms: Form[] = [
        {
          uri: '/api/items/1',
          name: 'update',
          method: 'PUT',
          contentType: 'application/json',
          fields: [],
        },
        {
          uri: '/api/items/1',
          name: 'remove',
          method: 'DELETE',
          contentType: 'application/json',
          fields: [],
        },
      ];
      const multiMethodState = new BaseState<SafeAny>({
        client: mockClient,
        data: {},
        links: multiMethodLinks,
        headers: mockHeaders,
        currentLink,
        forms: multiMethodForms,
      });

      expect(() => multiMethodState.actionFor('item')).toThrow(
        "Multiple actions found for 'item'. Specify method: PUT, DELETE",
      );
    });

    it('should throw ActionNotFound when method does not match any form', () => {
      expect(() => state.actionFor('edit', 'DELETE')).toThrow(
        "No action found for link 'edit' (href: /api/resources/123/edit)",
      );
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
