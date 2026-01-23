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

  describe('formSchema', () => {
    it('should generate schema for text fields', () => {
      const formWithTextField: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'title',
            type: 'text',
            required: true,
            readOnly: false,
            label: 'Title',
          } as Field,
          {
            name: 'subtitle',
            type: 'text',
            required: false,
            readOnly: false,
            label: 'Subtitle',
          } as Field,
        ],
      };

      const textAction = new SimpleAction<TestEntity>(mockClient, formWithTextField);
      const schema = textAction.formSchema();

      // Should validate required field
      expect(() => schema.parse({ title: 'Test' })).not.toThrow();
      expect(() => schema.parse({})).toThrow();

      // Should handle optional field
      expect(() => schema.parse({ title: 'Test', subtitle: 'Subtitle' })).not.toThrow();
    });

    it('should generate schema for number fields with constraints', () => {
      const formWithNumberField: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'age',
            type: 'number',
            required: true,
            readOnly: false,
            min: 0,
            max: 120,
            label: 'Age',
          } as Field,
        ],
      };

      const numberAction = new SimpleAction<TestEntity>(mockClient, formWithNumberField);
      const schema = numberAction.formSchema();

      // Should validate number constraints
      expect(() => schema.parse({ age: 25 })).not.toThrow();
      expect(() => schema.parse({ age: -1 })).toThrow();
      expect(() => schema.parse({ age: 150 })).toThrow();
      expect(() => schema.parse({ age: '25' as unknown as number })).toThrow();
    });

    it('should generate schema for boolean fields', () => {
      const formWithBooleanField: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'isActive',
            type: 'checkbox',
            required: true,
            readOnly: false,
            label: 'Active',
          } as Field,
        ],
      };

      const booleanAction = new SimpleAction<TestEntity>(mockClient, formWithBooleanField);
      const schema = booleanAction.formSchema();

      // Should validate boolean values
      expect(() => schema.parse({ isActive: true })).not.toThrow();
      expect(() => schema.parse({ isActive: false })).not.toThrow();
      expect(() => schema.parse({ isActive: 'true' as unknown as boolean })).toThrow();
    });

    it('should generate schema for select fields', () => {
      const formWithSelectField: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'category',
            type: 'select',
            required: true,
            readOnly: false,
            multiple: false,
            options: ['A', 'B', 'C'],
            label: 'Category',
          } as Field,
          {
            name: 'tags',
            type: 'select',
            required: false,
            readOnly: false,
            multiple: true,
            options: ['tag1', 'tag2', 'tag3'],
            label: 'Tags',
          } as Field,
        ],
      };

      const selectAction = new SimpleAction<TestEntity>(mockClient, formWithSelectField);
      const schema = selectAction.formSchema();

      // Should validate single select
      expect(() => schema.parse({ category: 'A' })).not.toThrow();
      expect(() => schema.parse({ category: 1 as unknown as string })).toThrow();

      // Should validate multi-select
      expect(() => schema.parse({ category: 'A', tags: ['tag1', 'tag2'] })).not.toThrow();
      expect(() => schema.parse({ category: 'A', tags: 'tag1' as unknown as string[] })).toThrow();
    });

    it('should generate schema for textarea with length constraints', () => {
      const formWithTextArea: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'content',
            type: 'textarea',
            required: true,
            readOnly: false,
            minLength: 10,
            maxLength: 500,
            label: 'Content',
          } as Field,
        ],
      };

      const textAreaAction = new SimpleAction<TestEntity>(mockClient, formWithTextArea);
      const schema = textAreaAction.formSchema();

      // Should validate length constraints
      expect(() => schema.parse({ content: 'This is a valid content' })).not.toThrow();
      expect(() => schema.parse({ content: 'Short' })).toThrow();
      expect(() => schema.parse({ content: 'x'.repeat(501) })).toThrow();
    });

    it('should generate schema for text field with pattern', () => {
      const formWithPattern: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'email',
            type: 'email',
            required: true,
            readOnly: false,
            pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            label: 'Email',
          } as Field,
        ],
      };

      const patternAction = new SimpleAction<TestEntity>(mockClient, formWithPattern);
      const schema = patternAction.formSchema();

      // Should validate pattern
      expect(() => schema.parse({ email: 'test@example.com' })).not.toThrow();
      expect(() => schema.parse({ email: 'invalid-email' })).toThrow();
    });

    it('should generate schema for date fields', () => {
      const formWithDateField: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'birthDate',
            type: 'date',
            required: true,
            readOnly: false,
            label: 'Birth Date',
          } as Field,
        ],
      };

      const dateAction = new SimpleAction<TestEntity>(mockClient, formWithDateField);
      const schema = dateAction.formSchema();

      // Should validate date as string
      expect(() => schema.parse({ birthDate: '2023-01-01' })).not.toThrow();
      expect(() => schema.parse({ birthDate: new Date() as unknown as string })).toThrow();
    });

    it('should generate schema for hidden fields', () => {
      const formWithHiddenField: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [
          {
            name: 'id',
            type: 'hidden',
            required: true,
            readOnly: false,
            label: 'ID',
          } as Field,
        ],
      };

      const hiddenAction = new SimpleAction<TestEntity>(mockClient, formWithHiddenField);
      const schema = hiddenAction.formSchema();

      // Should accept various types for hidden fields
      expect(() => schema.parse({ id: '123' })).not.toThrow();
      expect(() => schema.parse({ id: 123 })).not.toThrow();
      expect(() => schema.parse({ id: true })).not.toThrow();
      expect(() => schema.parse({ id: null })).not.toThrow();
    });

    it('should generate schema for mixed field types', () => {
      const formWithMixedFields: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
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
            name: 'age',
            type: 'number',
            required: true,
            readOnly: false,
            min: 0,
            label: 'Age',
          } as Field,
          {
            name: 'active',
            type: 'checkbox',
            required: false,
            readOnly: false,
            label: 'Active',
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

      const mixedAction = new SimpleAction<TestEntity>(mockClient, formWithMixedFields);
      const schema = mixedAction.formSchema();

      // Should validate all fields correctly
      expect(() => schema.parse({ name: 'John', age: 30, active: true, description: 'Test' })).not.toThrow();
      expect(() => schema.parse({ name: 'John', age: 30 })).not.toThrow();
      expect(() => schema.parse({ name: 'John', age: -1 })).toThrow();
      expect(() => schema.parse({ age: 30 })).toThrow();
    });

    it('should handle empty fields array', () => {
      const formWithNoFields: Form = {
        uri: 'https://example.com/api/resources',
        name: 'create',
        method: 'POST',
        contentType: 'application/json',
        fields: [],
      };

      const noFieldsAction = new SimpleAction<TestEntity>(mockClient, formWithNoFields);
      const schema = noFieldsAction.formSchema();

      // Should accept empty object
      expect(() => schema.parse({})).not.toThrow();
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
