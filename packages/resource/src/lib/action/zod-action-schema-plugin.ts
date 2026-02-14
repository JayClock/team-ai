import type { ActionFormSchema, SchemaPlugin } from './action.js';
import { Field } from '../form/field.js';
import * as z from 'zod';

type FieldSchemaNode = {
  children: Map<string, FieldSchemaNode>;
  schema?: z.ZodTypeAny;
  required: boolean;
};

type BuiltNode = {
  schema: z.ZodTypeAny;
  required: boolean;
};

const createZodSchemaForField = (field: Field): z.ZodTypeAny => {
  let schema: z.ZodTypeAny;

  switch (field.type) {
    case 'checkbox':
    case 'radio':
      schema = z.boolean();
      break;

    case 'number':
    case 'range':
      schema = z.number();
      if ('min' in field && field.min !== undefined) {
        schema = (schema as z.ZodNumber).min(field.min);
      }
      if ('max' in field && field.max !== undefined) {
        schema = (schema as z.ZodNumber).max(field.max);
      }
      break;

    case 'date':
    case 'month':
    case 'time':
    case 'week':
    case 'datetime':
    case 'datetime-local':
      schema = z.string();
      if ('min' in field && field.min !== undefined) {
        schema = (schema as z.ZodString).min(field.min);
      }
      if ('max' in field && field.max !== undefined) {
        schema = (schema as z.ZodString).max(field.max);
      }
      break;

    case 'hidden':
      schema = z.union([z.string(), z.number(), z.null(), z.boolean()]);
      break;

    case 'select':
      if ('multiple' in field && field.multiple === true) {
        schema = z.array(z.string());
      } else {
        schema = z.string();
      }
      break;

    case 'text':
    case 'textarea':
    case 'color':
    case 'email':
    case 'password':
    case 'search':
    case 'tel':
    case 'url':
    default:
      schema = z.string();
      if ('minLength' in field && field.minLength !== undefined) {
        schema = (schema as z.ZodString).min(field.minLength);
      }
      if ('maxLength' in field && field.maxLength !== undefined) {
        schema = (schema as z.ZodString).max(field.maxLength);
      }
      if ('pattern' in field && field.pattern !== undefined) {
        schema = (schema as z.ZodString).regex(field.pattern);
      }
      break;
  }

  return field.required ? schema : schema.optional();
};

const createNode = (): FieldSchemaNode => ({
  children: new Map<string, FieldSchemaNode>(),
  required: false,
});

const insertField = (root: FieldSchemaNode, field: Field) => {
  const path = field.name.split('.').filter(Boolean);
  if (path.length === 0) return;

  let current = root;
  for (let i = 0; i < path.length; i++) {
    const part = path[i];
    let next = current.children.get(part);
    if (!next) {
      next = createNode();
      current.children.set(part, next);
    }

    if (i === path.length - 1) {
      next.schema = createZodSchemaForField(field);
      next.required = field.required;
    }
    current = next;
  }
};

const buildNode = (node: FieldSchemaNode): BuiltNode => {
  if (node.children.size === 0) {
    return { schema: node.schema ?? z.unknown(), required: node.required };
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  let hasRequiredChild = false;

  for (const [key, child] of node.children) {
    const builtChild = buildNode(child);
    shape[key] = builtChild.schema;
    if (builtChild.required) {
      hasRequiredChild = true;
    }
  }

  const objectSchema = z.object(shape);
  if (hasRequiredChild) {
    return { schema: objectSchema, required: true };
  }
  return { schema: objectSchema.optional(), required: false };
};

export const zodSchemaPlugin: SchemaPlugin = {
  createSchema(fields: Field[]): ActionFormSchema {
    const root = createNode();

    for (const field of fields) {
      insertField(root, field);
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, child] of root.children) {
      shape[key] = buildNode(child).schema;
    }

    return z.object(shape);
  },
};

export const zodActionSchemaPlugin = zodSchemaPlugin;
