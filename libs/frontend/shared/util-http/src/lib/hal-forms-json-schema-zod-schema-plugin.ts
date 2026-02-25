import type { ActionFormSchema, SchemaPlugin } from '@hateoas-ts/resource';
import { TypeName, type JSONSchema } from 'json-schema-typed/draft-2019-09';
import * as z from 'zod';

type ActionFields = Parameters<SchemaPlugin['createSchema']>[0];
type ActionField = ActionFields[number];
type JsonObjectSchema = Exclude<JSONSchema, boolean>;

type FieldSchemaNode = {
  children: Map<string, FieldSchemaNode>;
  schema?: z.ZodTypeAny;
  required: boolean;
};

type BuiltNode = {
  schema: z.ZodTypeAny;
  required: boolean;
};

const asNullishCleanedOptional = (schema: z.ZodTypeAny): z.ZodTypeAny =>
  schema.nullish().transform((value) => value ?? undefined);

const JSON_SCHEMA_TYPES = new Set<TypeName>([
  TypeName.String,
  TypeName.Number,
  TypeName.Integer,
  TypeName.Boolean,
  TypeName.Null,
  TypeName.Object,
  TypeName.Array,
]);

const METADATA_ONLY_SCHEMA_KEYS = new Set<string>([
  '$id',
  '$schema',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonObjectSchema = (schema: JSONSchema): schema is JsonObjectSchema =>
  typeof schema === 'object' && schema !== null;

const toJsonSchema = (value: unknown): JSONSchema | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }
  return value as JsonObjectSchema;
};

const toJsonSchemaList = (value: unknown): JSONSchema[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toJsonSchema(entry))
    .filter((entry): entry is JSONSchema => entry !== undefined);
};

const normalizeSchemaTypes = (schema: JsonObjectSchema): TypeName[] => {
  const schemaType = schema.type;

  if (typeof schemaType === 'string') {
    return JSON_SCHEMA_TYPES.has(schemaType as TypeName)
      ? [schemaType as TypeName]
      : [];
  }

  if (Array.isArray(schemaType)) {
    return schemaType.filter(
      (entry): entry is TypeName =>
        typeof entry === 'string' && JSON_SCHEMA_TYPES.has(entry as TypeName),
    );
  }

  if (isRecord(schema.properties)) {
    return [TypeName.Object];
  }

  if (schema.items !== undefined) {
    return [TypeName.Array];
  }

  return [];
};

const resolveJsonPointer = (
  root: JsonObjectSchema,
  pointer: string,
): JSONSchema | undefined => {
  if (!pointer.startsWith('#/')) {
    return undefined;
  }

  const tokens = pointer
    .slice(2)
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = root;
  for (const token of tokens) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[token];
  }

  return toJsonSchema(current);
};

const resolveSchemaRef = (root: JsonObjectSchema, ref: string): JSONSchema | undefined => {
  const pointerSchema = resolveJsonPointer(root, ref);
  if (pointerSchema) {
    return pointerSchema;
  }

  if (ref.startsWith('#/$defs/')) {
    const key = ref.slice('#/$defs/'.length);
    return toJsonSchema(root.$defs?.[key]);
  }

  return undefined;
};

const composeUnion = (schemas: z.ZodTypeAny[]): z.ZodTypeAny => {
  if (schemas.length === 0) {
    return z.never();
  }

  let schema = schemas[0];
  for (let index = 1; index < schemas.length; index += 1) {
    schema = z.union([schema, schemas[index]]);
  }

  return schema;
};

const composeIntersection = (schemas: z.ZodTypeAny[]): z.ZodTypeAny => {
  if (schemas.length === 0) {
    return z.unknown();
  }

  let schema = schemas[0];
  for (let index = 1; index < schemas.length; index += 1) {
    schema = z.intersection(schema, schemas[index]);
  }

  return schema;
};

const toLiteralSchema = (value: unknown): z.ZodTypeAny | undefined => {
  if (typeof value === 'string') {
    return z.literal(value);
  }

  if (typeof value === 'number') {
    return z.literal(value);
  }

  if (typeof value === 'boolean') {
    return z.literal(value);
  }

  if (value === null) {
    return z.null();
  }

  return undefined;
};

const hasMeaningfulSchemaKeywords = (schema: JsonObjectSchema): boolean =>
  Object.keys(schema).some((key) => !METADATA_ONLY_SCHEMA_KEYS.has(key));

const readRequired = (schema: JsonObjectSchema): Set<string> => {
  if (!Array.isArray(schema.required)) {
    return new Set<string>();
  }

  return new Set(
    schema.required.filter((entry): entry is string => typeof entry === 'string'),
  );
};

const readProperties = (schema: JsonObjectSchema): Record<string, JSONSchema> => {
  if (!isRecord(schema.properties)) {
    return {};
  }

  const properties: Record<string, JSONSchema> = {};
  for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
    const parsedPropertySchema = toJsonSchema(propertySchema);
    if (parsedPropertySchema) {
      properties[propertyName] = parsedPropertySchema;
    }
  }

  return properties;
};

const applySchema = (
  schema: z.ZodTypeAny,
  jsonSchema: JsonObjectSchema,
): z.ZodTypeAny => {
  void jsonSchema;
  return schema;
};

const createStringSchema = (schema: JsonObjectSchema): z.ZodTypeAny => {
  let stringSchema = z.string();

  if (typeof schema.minLength === 'number') {
    stringSchema = stringSchema.min(schema.minLength);
  }

  if (typeof schema.maxLength === 'number') {
    stringSchema = stringSchema.max(schema.maxLength);
  }

  if (typeof schema.pattern === 'string') {
    try {
      stringSchema = stringSchema.regex(new RegExp(schema.pattern));
    } catch {
      // Ignore malformed patterns from server schema payload.
    }
  }

  switch (schema.format) {
    case 'email':
      stringSchema = stringSchema.email();
      break;
    case 'uri':
    case 'url':
      stringSchema = stringSchema.url();
      break;
    case 'uuid':
      stringSchema = stringSchema.uuid();
      break;
    case 'date-time':
      stringSchema = stringSchema.datetime();
      break;
    default:
      break;
  }

  return stringSchema;
};

const createNumberSchema = (
  schema: JsonObjectSchema,
  integerOnly: boolean,
): z.ZodTypeAny => {
  let numberSchema = z.number();

  if (integerOnly) {
    numberSchema = numberSchema.int();
  }

  if (typeof schema.minimum === 'number') {
    numberSchema = numberSchema.gte(schema.minimum);
  }

  if (typeof schema.maximum === 'number') {
    numberSchema = numberSchema.lte(schema.maximum);
  }

  if (typeof schema.exclusiveMinimum === 'number') {
    numberSchema = numberSchema.gt(schema.exclusiveMinimum);
  }

  if (typeof schema.exclusiveMaximum === 'number') {
    numberSchema = numberSchema.lt(schema.exclusiveMaximum);
  }

  return numberSchema;
};

const createObjectSchema = (
  schema: JsonObjectSchema,
  rootSchema: JsonObjectSchema,
  seenRefs: Set<string>,
): z.ZodTypeAny => {
  const required = readRequired(schema);
  const properties = readProperties(schema);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    const propertyZodSchema = jsonSchemaToZod(propertySchema, rootSchema, seenRefs);
    shape[propertyName] = required.has(propertyName)
      ? propertyZodSchema
      : asNullishCleanedOptional(propertyZodSchema);
  }

  let objectSchema = z.object(shape);

  if (schema.additionalProperties === false) {
    objectSchema = objectSchema.strict();
  } else {
    const additionalPropertiesSchema = toJsonSchema(schema.additionalProperties);
    if (additionalPropertiesSchema) {
      objectSchema = objectSchema.catchall(
        jsonSchemaToZod(additionalPropertiesSchema, rootSchema, seenRefs),
      );
    } else {
      objectSchema = objectSchema.passthrough();
    }
  }

  return objectSchema;
};

const createArraySchema = (
  schema: JsonObjectSchema,
  rootSchema: JsonObjectSchema,
  seenRefs: Set<string>,
): z.ZodTypeAny => {
  const itemSchemas = Array.isArray(schema.items)
    ? schema.items
        .map((itemSchema) => toJsonSchema(itemSchema))
        .filter((itemSchema): itemSchema is JSONSchema => itemSchema !== undefined)
    : [];

  const itemSchema = toJsonSchema(schema.items);
  const resolvedItemSchema =
    itemSchemas.length > 0
      ? composeUnion(
          itemSchemas.map((entry) => jsonSchemaToZod(entry, rootSchema, seenRefs)),
        )
      : itemSchema
        ? jsonSchemaToZod(itemSchema, rootSchema, seenRefs)
        : z.unknown();

  let arraySchema = z.array(resolvedItemSchema);

  if (typeof schema.minItems === 'number') {
    arraySchema = arraySchema.min(schema.minItems);
  }

  if (typeof schema.maxItems === 'number') {
    arraySchema = arraySchema.max(schema.maxItems);
  }

  return arraySchema;
};

const createSchemaByType = (
  schema: JsonObjectSchema,
  schemaType: TypeName,
  rootSchema: JsonObjectSchema,
  seenRefs: Set<string>,
): z.ZodTypeAny => {
  switch (schemaType) {
    case TypeName.String:
      return createStringSchema(schema);
    case TypeName.Number:
      return createNumberSchema(schema, false);
    case TypeName.Integer:
      return createNumberSchema(schema, true);
    case TypeName.Boolean:
      return z.boolean();
    case TypeName.Null:
      return z.null();
    case TypeName.Object:
      return createObjectSchema(schema, rootSchema, seenRefs);
    case TypeName.Array:
      return createArraySchema(schema, rootSchema, seenRefs);
    default:
      return z.unknown();
  }
};

const jsonSchemaToZod = (
  schema: JSONSchema,
  rootSchema: JsonObjectSchema,
  seenRefs: Set<string>,
): z.ZodTypeAny => {
  if (schema === false) {
    return z.never();
  }

  if (schema === true) {
    return z.unknown();
  }

  if (!isJsonObjectSchema(schema)) {
    return z.unknown();
  }

  if (typeof schema.$ref === 'string') {
    if (seenRefs.has(schema.$ref)) {
      return z.unknown();
    }

    const resolvedSchema = resolveSchemaRef(rootSchema, schema.$ref);
    if (resolvedSchema) {
      seenRefs.add(schema.$ref);
      const resolvedZodSchema = jsonSchemaToZod(resolvedSchema, rootSchema, seenRefs);
      seenRefs.delete(schema.$ref);

      const overlaySchema = { ...schema };
      delete overlaySchema.$ref;

      if (hasMeaningfulSchemaKeywords(overlaySchema)) {
        return applySchema(
          z.intersection(
            resolvedZodSchema,
            jsonSchemaToZod(overlaySchema, rootSchema, seenRefs),
          ),
          schema,
        );
      }

      return applySchema(resolvedZodSchema, schema);
    }
  }

  if (schema.const !== undefined) {
    const literal = toLiteralSchema(schema.const);
    if (literal) {
      return applySchema(literal, schema);
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const literalSchemas = schema.enum
      .map((entry) => toLiteralSchema(entry))
      .filter((entry): entry is z.ZodTypeAny => entry !== undefined);

    if (literalSchemas.length > 0) {
      return applySchema(composeUnion(literalSchemas), schema);
    }
  }

  const allOfSchemas = toJsonSchemaList(schema.allOf);
  if (allOfSchemas.length > 0) {
    return applySchema(
      composeIntersection(
        allOfSchemas.map((entry) => jsonSchemaToZod(entry, rootSchema, seenRefs)),
      ),
      schema,
    );
  }

  const anyOfSchemas = toJsonSchemaList(schema.anyOf);
  if (anyOfSchemas.length > 0) {
    return applySchema(
      composeUnion(
        anyOfSchemas.map((entry) => jsonSchemaToZod(entry, rootSchema, seenRefs)),
      ),
      schema,
    );
  }

  const oneOfSchemas = toJsonSchemaList(schema.oneOf);
  if (oneOfSchemas.length > 0) {
    return applySchema(
      composeUnion(
        oneOfSchemas.map((entry) => jsonSchemaToZod(entry, rootSchema, seenRefs)),
      ),
      schema,
    );
  }

  const schemaTypes = normalizeSchemaTypes(schema);
  if (schemaTypes.length === 0) {
    return applySchema(z.unknown(), schema);
  }

  const typedSchemas = schemaTypes.map((schemaType) =>
    createSchemaByType(schema, schemaType, rootSchema, seenRefs),
  );

  return applySchema(composeUnion(typedSchemas), schema);
};

const extractSchemaFromField = (field: ActionField): JSONSchema | undefined => {
  const extensions = field.extensions;
  if (!extensions || !isRecord(extensions)) {
    return undefined;
  }

  return toJsonSchema(extensions._schema);
};

const createFallbackSchemaForField = (field: ActionField): z.ZodTypeAny => {
  switch (field.type) {
    case 'checkbox':
    case 'radio':
      return z.boolean();

    case 'number':
    case 'range': {
      let numberSchema = z.number();
      if ('min' in field && typeof field.min === 'number') {
        numberSchema = numberSchema.min(field.min);
      }
      if ('max' in field && typeof field.max === 'number') {
        numberSchema = numberSchema.max(field.max);
      }
      return numberSchema;
    }

    case 'date':
    case 'month':
    case 'time':
    case 'week':
    case 'datetime':
    case 'datetime-local': {
      let stringSchema = z.string();
      if ('min' in field && typeof field.min === 'number') {
        stringSchema = stringSchema.min(field.min);
      }
      if ('max' in field && typeof field.max === 'number') {
        stringSchema = stringSchema.max(field.max);
      }
      return stringSchema;
    }

    case 'hidden':
      return z.union([z.string(), z.number(), z.null(), z.boolean()]);

    case 'select':
      if ('multiple' in field && field.multiple === true) {
        return z.array(z.string());
      }
      return z.string();

    case 'textarea':
    case 'text':
    case 'color':
    case 'email':
    case 'password':
    case 'search':
    case 'tel':
    case 'url': {
      let stringSchema = z.string();
      if ('minLength' in field && typeof field.minLength === 'number') {
        stringSchema = stringSchema.min(field.minLength);
      }
      if ('maxLength' in field && typeof field.maxLength === 'number') {
        stringSchema = stringSchema.max(field.maxLength);
      }
      if ('pattern' in field && field.pattern instanceof RegExp) {
        stringSchema = stringSchema.regex(field.pattern);
      }
      return stringSchema;
    }

    case 'file':
      return z.unknown();

    default:
      return z.string();
  }
};

const createFieldSchema = (field: ActionField): z.ZodTypeAny => {
  const jsonSchema = extractSchemaFromField(field);
  let baseSchema: z.ZodTypeAny;

  if (jsonSchema === false) {
    baseSchema = z.never();
  } else if (jsonSchema === true) {
    baseSchema = z.unknown();
  } else if (jsonSchema && isJsonObjectSchema(jsonSchema)) {
    baseSchema = jsonSchemaToZod(jsonSchema, jsonSchema, new Set<string>());
  } else {
    baseSchema = createFallbackSchemaForField(field);
  }

  return field.required ? baseSchema : asNullishCleanedOptional(baseSchema);
};

const createNode = (): FieldSchemaNode => ({
  children: new Map<string, FieldSchemaNode>(),
  required: false,
});

const insertField = (root: FieldSchemaNode, field: ActionField, schema: z.ZodTypeAny): void => {
  const path = field.name.split('.').filter(Boolean);
  if (path.length === 0) {
    return;
  }

  let current = root;
  for (let index = 0; index < path.length; index += 1) {
    const part = path[index];
    let next = current.children.get(part);
    if (!next) {
      next = createNode();
      current.children.set(part, next);
    }

    if (index === path.length - 1) {
      next.schema = schema;
      next.required = field.required;
    }

    current = next;
  }
};

const buildNode = (node: FieldSchemaNode): BuiltNode => {
  if (node.children.size === 0) {
    return {
      schema: node.schema ?? z.unknown(),
      required: node.required,
    };
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
    return {
      schema: objectSchema,
      required: true,
    };
  }

  return {
    schema: asNullishCleanedOptional(objectSchema),
    required: false,
  };
};

export const halFormsJsonSchemaZodSchemaPlugin: SchemaPlugin = {
  createSchema(fields: ActionFields): ActionFormSchema {
    const root = createNode();

    for (const field of fields) {
      insertField(root, field, createFieldSchema(field));
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, child] of root.children) {
      shape[key] = buildNode(child).schema;
    }

    return z.object(shape);
  },
};
