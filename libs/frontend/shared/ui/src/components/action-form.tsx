import { Action, Entity } from '@hateoas-ts/resource';
import { Form as ShadcnForm } from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import { ReactNode, useMemo } from 'react';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as z from 'zod/v3';

type FormData = Record<string, unknown>;
type ActionUiSchema = Record<string, unknown>;

type ActionFieldLike = {
  name: string;
  type: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  extensions?: Record<string, unknown>;
};

type ActionFormProps<TEntity extends Entity> = {
  action: Action<TEntity>;
  formData: FormData;
  onFormDataChange: (formData: FormData) => void;
  onSubmit: (formData: FormData) => void | Promise<void>;
  uiSchema?: ActionUiSchema;
  children?: ReactNode;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toFormData = (value: unknown): FormData => (isRecord(value) ? value : {});

const hasObjectProperties = (value: unknown): boolean =>
  isRecord(value) &&
  isRecord(value.properties) &&
  Object.keys(value.properties).length > 0;

const toZodSchema = (field: ActionFieldLike): z.ZodTypeAny => {
  if (field.type === 'number' || field.type === 'range') {
    let numberSchema = z.number();
    if (typeof field.min === 'number') {
      numberSchema = numberSchema.min(field.min);
    }
    if (typeof field.max === 'number') {
      numberSchema = numberSchema.max(field.max);
    }
    return field.required ? numberSchema : numberSchema.optional();
  }

  let stringSchema = z.string();
  if (typeof field.minLength === 'number') {
    stringSchema = stringSchema.min(field.minLength);
  }
  if (typeof field.maxLength === 'number') {
    stringSchema = stringSchema.max(field.maxLength);
  }
  return field.required ? stringSchema : stringSchema.optional();
};

const toFieldSchema = (field: ActionFieldLike): Record<string, unknown> => {
  const candidate = field.extensions?._schema;
  if (typeof candidate === 'boolean') {
    return candidate ? {} : { not: {} };
  }
  if (isRecord(candidate)) {
    return candidate;
  }

  const fallback = zodToJsonSchema(toZodSchema(field), {
    name: field.name || 'Field',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;

  if (isRecord(fallback.definitions)) {
    const fieldSchema = fallback.definitions[field.name];
    if (isRecord(fieldSchema)) {
      return fieldSchema;
    }
  }
  return fallback;
};

const toJsonSchema = <TEntity extends Entity>(
  action: Action<TEntity>,
): Record<string, unknown> => {
  const actionSchemaResult = zodToJsonSchema(
    action.formSchema as unknown as z.ZodSchema<unknown>,
    {
      name: action.name || 'ActionForm',
      target: 'jsonSchema7',
    },
  ) as Record<string, unknown>;
  if (hasObjectProperties(actionSchemaResult)) {
    actionSchemaResult.title = action.title ?? 'Form';
    return actionSchemaResult;
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of action.fields as unknown as ActionFieldLike[]) {
    if (!field.name || field.name.includes('.')) {
      continue;
    }
    properties[field.name] = toFieldSchema(field);
    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    title: action.title ?? 'Form',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
};

export function ActionForm<TEntity extends Entity>(props: ActionFormProps<TEntity>) {
  const { action, formData, onFormDataChange, onSubmit, uiSchema, children } = props;
  const jsonSchema = useMemo(() => toJsonSchema(action), [action]);
  const mergedUiSchema = useMemo(
    () => ({
      'ui:submitButtonOptions': { norender: children !== undefined },
      ...uiSchema,
    }),
    [children, uiSchema],
  );

  return (
    <ShadcnForm
      schema={jsonSchema}
      uiSchema={mergedUiSchema}
      validator={validator}
      formData={formData}
      noHtml5Validate
      showErrorList={false}
      onChange={(event) => {
        onFormDataChange(toFormData(event.formData));
      }}
      onSubmit={(event) => {
        void onSubmit(toFormData(event.formData));
      }}
    >
      {children}
    </ShadcnForm>
  );
}

export type { ActionFormProps };
