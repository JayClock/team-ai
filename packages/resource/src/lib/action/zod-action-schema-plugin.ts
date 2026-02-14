import type { ActionFormSchema, SchemaPlugin } from './action.js';
import { Field } from '../form/field.js';
import * as z from 'zod';

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

export const zodSchemaPlugin: SchemaPlugin = {
  createSchema(fields: Field[]): ActionFormSchema {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of fields) {
      shape[field.name] = createZodSchemaForField(field);
    }
    return z.object(shape);
  },
};

export const zodActionSchemaPlugin = zodSchemaPlugin;
