import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionNotFound, SimpleAction } from '../../lib/action/action.js';
import { Form } from '../../lib/form/form.js';
import { ClientInstance } from '../../lib/client-instance.js';
import { Entity } from '../../lib/index.js';
import { Field } from '../../lib/form/field.js';

type TestEntity = Entity<
  {
    id: string;
    name: string;
  },
  {
    self: TestEntity;
  }
>;

describe('SimpleAction', () => {
  let mockClient: ClientInstance;
  let mockForm: Form;
  let action: SimpleAction<TestEntity>;

  beforeEach(() => {
    mockClient = {
      bookmarkUri: 'https://example.com/',
      go: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          uri: 'https://example.com/api/resources',
          data: { id: '1', name: 'Test' },
        }),
      }),
      fetcher: {
        fetchOrThrow: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ id: '1', name: 'Created' }), {
            status: 201,
            headers: new Headers({ 'Content-Type': 'application/json' }),
          }),
        ),
      },
      getStateForResponse: vi.fn().mockResolvedValue({
        uri: 'https://example.com/api/resources/1',
        data: { id: '1', name: 'Created' },
      }),
    } as unknown as ClientInstance;

    mockForm = {
      uri: 'https://example.com/api/resources',
      name: 'create',
      title: 'Create Resource',
      method: 'POST',
      contentType: 'application/json',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          readOnly: false,
          label: 'Name',
        } as Field,
        {
          name: 'description',
          type: 'textarea',
          required: false,
          readOnly: false,
          label: 'Description',
        } as Field,
      ],
    };

    action = new SimpleAction<TestEntity>(mockClient, mockForm);
  });

  describe('constructor', () => {
    it('should initialize properties from form', () => {
      expect(action.uri).toBe('https://example.com/api/resources');
      expect(action.name).toBe('create');
      expect(action.title).toBe('Create Resource');
      expect(action.method).toBe('POST');
      expect(action.contentType).toBe('application/json');
      expect(action.fields).toHaveLength(2);
    });

    it('should handle form without title', () => {
      const formWithoutTitle: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [],
      };

      const actionWithoutTitle = new SimpleAction<TestEntity>(
        mockClient,
        formWithoutTitle,
      );

      expect(actionWithoutTitle.title).toBeUndefined();
    });
  });

  describe('field', () => {
    it('should return field by name', () => {
      const field = action.field('name');

      expect(field).toBeDefined();
      expect(field?.name).toBe('name');
      expect(field?.type).toBe('text');
      expect(field?.required).toBe(true);
    });

    it('should return undefined for non-existing field', () => {
      const field = action.field('nonexistent');

      expect(field).toBeUndefined();
    });

    it('should return the correct field among multiple fields', () => {
      const descriptionField = action.field('description');

      expect(descriptionField).toBeDefined();
      expect(descriptionField?.name).toBe('description');
      expect(descriptionField?.type).toBe('textarea');
    });
  });

  describe('submit', () => {
    describe('with GET method', () => {
      beforeEach(() => {
        mockForm = {
          uri: 'https://example.com/api/search',
          name: 'search',
          method: 'GET',
          contentType: 'application/x-www-form-urlencoded',
          fields: [
            {
              name: 'query',
              type: 'text',
              required: true,
              readOnly: false,
            } as Field,
          ],
        };
        action = new SimpleAction<TestEntity>(mockClient, mockForm);
      });

      it('should append form data as query string and use client.go', async () => {
        const formData = { query: 'test', page: 1 };

        await action.submit(formData);

        expect(mockClient.go).toHaveBeenCalledWith(
          'https://example.com/api/search?query=test&page=1',
        );
      });

      it('should call get() for GET method', async () => {
        const formData = { query: 'test' };

        await action.submit(formData);

        const goResult = (mockClient.go as ReturnType<typeof vi.fn>).mock
          .results[0].value;
        expect(goResult.get).toHaveBeenCalled();
      });
    });

    describe('with POST method and JSON content type', () => {
      it('should submit JSON body', async () => {
        const formData = { name: 'New Resource', description: 'A description' };

        await action.submit(formData);

        expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
          'https://example.com/api/resources',
          {
            method: 'POST',
            body: JSON.stringify(formData),
            headers: new Headers({
              'Content-Type': 'application/json',
            }),
          },
        );
      });

      it('should call getStateForResponse with correct parameters', async () => {
        const formData = { name: 'New Resource' };

        await action.submit(formData);

        expect(mockClient.getStateForResponse).toHaveBeenCalledWith(
          {
            rel: '',
            href: 'https://example.com/api/resources',
            context: 'https://example.com/',
          },
          expect.any(Response),
        );
      });

      it('should return the state from getStateForResponse', async () => {
        const formData = { name: 'New Resource' };

        const result = await action.submit(formData);

        expect(result).toEqual({
          uri: 'https://example.com/api/resources/1',
          data: { id: '1', name: 'Created' },
        });
      });
    });

    describe('with form-urlencoded content type', () => {
      beforeEach(() => {
        mockForm = {
          uri: 'https://example.com/api/resources',
          name: 'create',
          method: 'POST',
          contentType: 'application/x-www-form-urlencoded',
          fields: [],
        };
        action = new SimpleAction<TestEntity>(mockClient, mockForm);
      });

      it('should submit form-urlencoded body', async () => {
        const formData = { name: 'Test', value: '123' };

        await action.submit(formData);

        expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
          'https://example.com/api/resources',
          {
            method: 'POST',
            body: 'name=Test&value=123',
            headers: new Headers({
              'Content-Type': 'application/x-www-form-urlencoded',
            }),
          },
        );
      });
    });

    describe('with PUT method', () => {
      beforeEach(() => {
        mockForm = {
          uri: 'https://example.com/api/resources/1',
          name: 'update',
          method: 'PUT',
          contentType: 'application/json',
          fields: [],
        };
        action = new SimpleAction<TestEntity>(mockClient, mockForm);
      });

      it('should use PUT method', async () => {
        const formData = { name: 'Updated Resource' };

        await action.submit(formData);

        expect(mockClient.fetcher.fetchOrThrow).toHaveBeenCalledWith(
          'https://example.com/api/resources/1',
          expect.objectContaining({
            method: 'PUT',
          }),
        );
      });
    });

    describe('with unsupported content type', () => {
      beforeEach(() => {
        mockForm = {
          uri: 'https://example.com/api/resources',
          name: 'upload',
          method: 'POST',
          contentType: 'multipart/form-data',
          fields: [],
        };
        action = new SimpleAction<TestEntity>(mockClient, mockForm);
      });

      it('should throw error for unsupported content type', async () => {
        const formData = { file: 'data' };

        await expect(action.submit(formData)).rejects.toThrow(
          'Serializing mimetype multipart/form-data is not yet supported in actions',
        );
      });
    });
  });
});

describe('ActionNotFound', () => {
  it('should be an instance of Error', () => {
    const error = new ActionNotFound('Action not found');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ActionNotFound);
    expect(error.message).toBe('Action not found');
  });

  it('should have correct name', () => {
    const error = new ActionNotFound('Test error');

    expect(error.name).toBe('ActionNotFound');
  });
});
