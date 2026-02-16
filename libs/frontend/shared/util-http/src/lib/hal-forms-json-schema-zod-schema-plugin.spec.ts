import { describe, expect, it } from 'vitest';
import { halFormsJsonSchemaZodSchemaPlugin } from './hal-forms-json-schema-zod-schema-plugin.js';

type ActionFormData = Record<string, unknown>;
type ActionFields = Parameters<
  typeof halFormsJsonSchemaZodSchemaPlugin.createSchema
>[0];

const schemaIssues = async (fields: ActionFields, data: ActionFormData) => {
  const schema = halFormsJsonSchemaZodSchemaPlugin.createSchema(fields);
  const validationResult = await schema['~standard'].validate(data);
  return 'issues' in validationResult ? validationResult.issues : undefined;
};

const schemaValue = async (fields: ActionFields, data: ActionFormData) => {
  const schema = halFormsJsonSchemaZodSchemaPlugin.createSchema(fields);
  const validationResult = await schema['~standard'].validate(data);
  return 'value' in validationResult ? validationResult.value : undefined;
};

describe('halFormsJsonSchemaZodSchemaPlugin', () => {
  it('converts _schema array/object to zod schema', async () => {
    const fields: ActionFields = [
      {
        name: 'nodes',
        type: 'text',
        required: true,
        readOnly: false,
        extensions: {
          _schema: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['type', 'width'],
              properties: {
                type: { type: 'string' },
                width: { type: 'integer', minimum: 1 },
                logicalEntity: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    ];

    expect(
      await schemaIssues(fields, {
        nodes: [
          {
            type: 'fulfillment-node',
            width: 220,
            logicalEntity: {
              id: 'logical-1',
            },
          },
        ],
      }),
    ).toBeUndefined();

    expect(
      await schemaIssues(fields, {
        nodes: [
          {
            type: 'fulfillment-node',
          },
        ],
      }),
    ).toBeDefined();
  });

  it('supports $ref and $defs in _schema payload', async () => {
    const fields: ActionFields = [
      {
        name: 'edges',
        type: 'text',
        required: true,
        readOnly: false,
        extensions: {
          _schema: {
            type: 'array',
            items: {
              $ref: '#/$defs/edge',
            },
            $defs: {
              edge: {
                type: 'object',
                required: ['sourceNode', 'targetNode'],
                properties: {
                  sourceNode: { $ref: '#/$defs/nodeRef' },
                  targetNode: { $ref: '#/$defs/nodeRef' },
                  label: { type: 'string' },
                },
              },
              nodeRef: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: 'string' },
                },
              },
            },
          },
        },
      },
    ];

    expect(
      await schemaIssues(fields, {
        edges: [
          {
            sourceNode: { id: 'node-1' },
            targetNode: { id: 'node-2' },
          },
        ],
      }),
    ).toBeUndefined();

    expect(
      await schemaIssues(fields, {
        edges: [
          {
            sourceNode: { id: 'node-1' },
            targetNode: {},
          },
        ],
      }),
    ).toBeDefined();

    expect(
      await schemaIssues(fields, {
        edges: [
          {
            sourceNode: { id: 'node-1' },
            targetNode: { id: 'node-2' },
            label: null,
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('keeps HAL-FORMS dot-notation fallback behavior', async () => {
    const fields: ActionFields = [
      {
        name: 'logicalEntity.id',
        type: 'text',
        required: true,
        readOnly: false,
      },
      {
        name: 'logicalEntity.label',
        type: 'text',
        required: false,
        readOnly: false,
      },
    ];

    expect(
      await schemaIssues(fields, {
        logicalEntity: {
          id: 'logical-1',
        },
      }),
    ).toBeUndefined();

    expect(await schemaIssues(fields, {})).toBeDefined();
  });

  it('cleans null to undefined for optional fields', async () => {
    const fields: ActionFields = [
      {
        name: 'title',
        type: 'text',
        required: true,
        readOnly: false,
      },
      {
        name: 'logicalEntity.id',
        type: 'text',
        required: false,
        readOnly: false,
      },
    ];

    expect(await schemaIssues(fields, { title: 'Node', logicalEntity: null })).toBeUndefined();
    expect(
      await schemaValue(fields, { title: 'Node', logicalEntity: null }),
    ).toEqual({
      title: 'Node',
      logicalEntity: undefined,
    });
  });
});
