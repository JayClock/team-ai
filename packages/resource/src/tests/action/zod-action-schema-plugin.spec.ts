import { describe, expect, it } from 'vitest';
import { Field } from '../../lib/form/field.js';
import type { ActionFormSchema } from '../../lib/action/action.js';
import { zodSchemaPlugin } from '../../lib/action/zod-action-schema-plugin.js';

const schemaIssues = async (
  schema: ActionFormSchema,
  data: Record<string, unknown>,
) => {
  const result = await schema['~standard'].validate(data);
  return 'issues' in result ? result.issues : undefined;
};

const expectSchemaValid = async (
  schema: ActionFormSchema,
  data: Record<string, unknown>,
) => {
  expect(await schemaIssues(schema, data)).toBeUndefined();
};

const expectSchemaInvalid = async (
  schema: ActionFormSchema,
  data: Record<string, unknown>,
) => {
  const issues = await schemaIssues(schema, data);
  expect(issues).toBeDefined();
  expect(issues?.length ?? 0).toBeGreaterThan(0);
};

describe('zodSchemaPlugin', () => {
  it('should expose zod standard schema metadata', () => {
    const schema = zodSchemaPlugin.createSchema([]);
    expect(schema['~standard'].vendor).toBe('zod');
    expect(schema['~standard'].version).toBe(1);
  });

  it('should generate schema for text fields', async () => {
    const schema = zodSchemaPlugin.createSchema([
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
    ]);

    await expectSchemaValid(schema, { title: 'Test' });
    await expectSchemaInvalid(schema, {});
    await expectSchemaValid(schema, { title: 'Test', subtitle: 'Subtitle' });
  });

  it('should generate schema for number fields with constraints', async () => {
    const schema = zodSchemaPlugin.createSchema([
      {
        name: 'age',
        type: 'number',
        required: true,
        readOnly: false,
        min: 0,
        max: 120,
        label: 'Age',
      } as Field,
    ]);

    await expectSchemaValid(schema, { age: 25 });
    await expectSchemaInvalid(schema, { age: -1 });
    await expectSchemaInvalid(schema, { age: 150 });
    await expectSchemaInvalid(schema, { age: '25' as unknown as number });
  });

  it('should generate schema for boolean fields', async () => {
    const schema = zodSchemaPlugin.createSchema([
      {
        name: 'isActive',
        type: 'checkbox',
        required: true,
        readOnly: false,
        label: 'Active',
      } as Field,
    ]);

    await expectSchemaValid(schema, { isActive: true });
    await expectSchemaValid(schema, { isActive: false });
    await expectSchemaInvalid(schema, { isActive: 'true' as unknown as boolean });
  });

  it('should generate schema for select fields', async () => {
    const schema = zodSchemaPlugin.createSchema([
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
    ]);

    await expectSchemaValid(schema, { category: 'A' });
    await expectSchemaInvalid(schema, { category: 1 as unknown as string });
    await expectSchemaValid(schema, { category: 'A', tags: ['tag1', 'tag2'] });
    await expectSchemaInvalid(schema, {
      category: 'A',
      tags: 'tag1' as unknown as string[],
    });
  });

  it('should generate schema for textarea with length constraints', async () => {
    const schema = zodSchemaPlugin.createSchema([
      {
        name: 'content',
        type: 'textarea',
        required: true,
        readOnly: false,
        minLength: 10,
        maxLength: 500,
        label: 'Content',
      } as Field,
    ]);

    await expectSchemaValid(schema, { content: 'This is a valid content' });
    await expectSchemaInvalid(schema, { content: 'Short' });
    await expectSchemaInvalid(schema, { content: 'x'.repeat(501) });
  });

  it('should generate schema for text field with pattern', async () => {
    const schema = zodSchemaPlugin.createSchema([
      {
        name: 'email',
        type: 'email',
        required: true,
        readOnly: false,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        label: 'Email',
      } as Field,
    ]);

    await expectSchemaValid(schema, { email: 'test@example.com' });
    await expectSchemaInvalid(schema, { email: 'invalid-email' });
  });

  it('should generate schema for date fields', async () => {
    const schema = zodSchemaPlugin.createSchema([
      {
        name: 'birthDate',
        type: 'date',
        required: true,
        readOnly: false,
        label: 'Birth Date',
      } as Field,
    ]);

    await expectSchemaValid(schema, { birthDate: '2023-01-01' });
    await expectSchemaInvalid(schema, {
      birthDate: new Date() as unknown as string,
    });
  });

  it('should generate schema for hidden fields', async () => {
    const schema = zodSchemaPlugin.createSchema([
      {
        name: 'id',
        type: 'hidden',
        required: true,
        readOnly: false,
        label: 'ID',
      } as Field,
    ]);

    await expectSchemaValid(schema, { id: '123' });
    await expectSchemaValid(schema, { id: 123 });
    await expectSchemaValid(schema, { id: true });
    await expectSchemaValid(schema, { id: null });
  });

  it('should generate schema for mixed field types', async () => {
    const schema = zodSchemaPlugin.createSchema([
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
    ]);

    await expectSchemaValid(schema, {
      name: 'John',
      age: 30,
      active: true,
      description: 'Test',
    });
    await expectSchemaValid(schema, { name: 'John', age: 30 });
    await expectSchemaInvalid(schema, { name: 'John', age: -1 });
    await expectSchemaInvalid(schema, { age: 30 });
  });

  it('should handle empty fields array', async () => {
    const schema = zodSchemaPlugin.createSchema([]);
    await expectSchemaValid(schema, {});
  });
});
