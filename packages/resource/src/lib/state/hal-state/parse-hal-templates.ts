import {
  HalFormsOptionsInline,
  HalFormsProperty,
  HalFormsSimpleProperty,
  HalLink,
  HalResource,
} from 'hal-types';
import { SafeAny } from '../../archtype/safe-any.js';
import { Links } from '../../links/links.js';
import { Form } from '../../form/form.js';
import { Field } from '../../form/field.js';
import { HttpMethod } from 'src/lib/http/util.js';

const HAL_FORMS_STANDARD_PROPERTY_KEYS = new Set([
  'name',
  'type',
  'value',
  'prompt',
  'required',
  'readOnly',
  'placeholder',
  'regex',
  'minLength',
  'maxLength',
  'min',
  'max',
  'step',
  'cols',
  'rows',
  'options',
]);

type HalCustomFields = Record<string, SafeAny>;

export function isInlineOptions(
  options: HalFormsSimpleProperty['options'],
): options is HalFormsOptionsInline {
  return (options as SafeAny).inline !== undefined;
}

function extractHalCustomFields(halField: HalFormsProperty): HalCustomFields {
  const customFields: HalCustomFields = {};

  for (const [key, value] of Object.entries(halField as Record<string, SafeAny>)) {
    if (HAL_FORMS_STANDARD_PROPERTY_KEYS.has(key)) continue;
    customFields[key] = value;
  }

  return customFields;
}

function withHalCustomFields(field: Field, halField: HalFormsProperty): Field {
  const customFields = extractHalCustomFields(halField);

  if (!Object.keys(customFields).length) {
    return field;
  }

  return {
    ...field,
    extensions: customFields,
  };
}

export function parseHalTemplates(
  links: Links<SafeAny>,
  templates: HalResource['_templates'] = {},
): Form[] {
  return Object.entries(templates).map(([key, template]) => ({
    name: key,
    title: template.title,
    method: template.method as HttpMethod,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    uri: template.target ?? (links.get('self')! as HalLink).href,
    contentType: template.contentType ?? 'application/json',
    fields:
      template.properties?.map((property) => parseHalField(property)) || [],
  }));
}

export function parseHalField(halField: HalFormsProperty): Field {
  switch (halField.type) {
    case undefined:
    case 'text':
    case 'search':
    case 'tel':
    case 'url':
    case 'email':
      if (halField.options) {
        const baseField = {
          name: halField.name,
          type: 'select' as const,
          label: halField.prompt,
          required: halField.required || false,
          readOnly: halField.readOnly || false,
          multiple: halField.options.multiple as SafeAny,
          value: (halField.options.selectedValues || halField.value) as SafeAny,
        };

        const labelField = halField.options.promptField || 'prompt';
        const valueField = halField.options.valueField || 'value';
        if (isInlineOptions(halField.options)) {
          const options: Record<string, string> = {};

          for (const entry of halField.options.inline) {
            if (typeof entry === 'string') {
              options[entry] = entry;
            } else {
              options[entry[valueField]] = entry[labelField];
            }
          }

          return withHalCustomFields({
            ...baseField,
            options,
          }, halField);
        } else {
          return withHalCustomFields({
            ...baseField,
            dataSource: {
              href: halField.options.link.href,
              type: halField.options.link.type,
              labelField,
              valueField,
            },
          }, halField);
        }
      } else {
        return withHalCustomFields({
          name: halField.name,
          type: halField.type ?? 'text',
          required: halField.required || false,
          readOnly: halField.readOnly || false,
          value: halField.value,
          pattern: halField.regex ? new RegExp(halField.regex) : undefined,
          label: halField.prompt,
          placeholder: halField.placeholder,
          minLength: halField.minLength,
          maxLength: halField.maxLength,
        }, halField);
      }
    case 'hidden':
      return withHalCustomFields({
        name: halField.name,
        type: 'hidden',
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        value: halField.value,
        label: halField.prompt,
        placeholder: halField.placeholder,
      }, halField);
    case 'textarea':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        value: halField.value,
        label: halField.prompt,
        placeholder: halField.placeholder,
        cols: halField.cols,
        rows: halField.rows,
        minLength: halField.minLength,
        maxLength: halField.maxLength,
      }, halField);
    case 'password':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        placeholder: halField.placeholder,
        minLength: halField.minLength,
        maxLength: halField.maxLength,
      }, halField);
    case 'date':
    case 'month':
    case 'week':
    case 'time':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        value: halField.value,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        min: halField.min,
        max: halField.max,
        step: halField.step,
      }, halField);
    case 'number':
    case 'range':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        value: halField.value ? +halField.value : undefined,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        min: halField.min,
        max: halField.max,
        step: halField.step,
      }, halField);
    case 'datetime-local':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        value: halField.value ? new Date(halField.value) : undefined,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        min: halField.min,
        max: halField.max,
        step: halField.step,
      }, halField);
    case 'color':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        value: halField.value,
      }, halField);
    case 'radio':
    case 'checkbox':
      return withHalCustomFields({
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        value: !!halField.value,
      }, halField);
  }
}
