import { HalState } from './hal-state.js';
import { Entity } from '../archtype/entity.js';
import { Client } from '../client.js';
import {
  HalFormsOptionsInline,
  HalFormsProperty,
  HalFormsSimpleProperty,
  HalLink,
  HalResource,
} from 'hal-types';
import { Links } from '../links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { SafeAny } from '../archtype/safe-any.js';
import { Field } from '../form/field.js';

export function HalStateFactory<TEntity extends Entity>(
  client: Client,
  uri: string,
  halResource: HalResource,
  collectionRel?: string
): State<TEntity> {
  const { _links, _embedded, _templates, ...prueData } = halResource;
  const embedded = parseHalEmbedded(client, _embedded);
  return new HalState<TEntity>({
    client,
    uri,
    data: prueData,
    links: parseHalLinks(_links),
    collection: collectionRel
      ? (embedded[collectionRel] as StateCollection<TEntity>) ?? []
      : [],
    forms: parseHalTemplates(_links, _templates),
    embedded: embedded,
  });
}

function parseHalLinks<TLinks extends Record<string, SafeAny>>(
  halLinks: HalResource['_links']
): Links<TLinks> {
  const links = new Links<TLinks>();
  for (const [key, value] of Object.entries(halLinks ?? [])) {
    const linkList = Array.isArray(value) ? value : [value];
    links.add(
      linkList.map((item) => ({ ...item, rel: key, type: item.type ?? 'GET' }))
    );
  }
  return links;
}

function parseHalTemplates(
  links: HalResource['_links'] = {},
  templates: HalResource['_templates'] = {}
): Form[] {
  return Object.values(templates).map((template) => ({
    title: template.title,
    method: template.method,
    uri: template.target ?? (links.self as HalLink).href,
    contentType: template.contentType ?? 'application/json',
    fields:
      template.properties?.map((property) => parseHalField(property)) || [],
  }));
}

function parseHalEmbedded(
  client: Client,
  embedded: HalResource['_embedded'] = {}
): Record<string, State | State[]> {
  const res: Record<string, State | State[]> = {};
  for (const [rel, resource] of Object.entries(embedded)) {
    if (Array.isArray(resource)) {
      res[rel] = resource.map((data) =>
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        HalStateFactory(client, (data._links!.self as HalLink).href, data)
      );
    } else {
      res[rel] = HalStateFactory(
        client,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (resource._links!.self as HalLink).href,
        resource
      );
    }
  }
  return res;
}

function parseHalField(halField: HalFormsProperty): Field {
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

          return {
            ...baseField,
            options,
          };
        } else {
          return {
            ...baseField,
            dataSource: {
              href: halField.options.link.href,
              type: halField.options.link.type,
              labelField,
              valueField,
            },
          };
        }
      } else {
        return {
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
        };
      }
    case 'hidden':
      return {
        name: halField.name,
        type: 'hidden',
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        value: halField.value,
        label: halField.prompt,
        placeholder: halField.placeholder,
      };
    case 'textarea':
      return {
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
      };
    case 'password':
      return {
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        placeholder: halField.placeholder,
        minLength: halField.minLength,
        maxLength: halField.maxLength,
      };
    case 'date':
    case 'month':
    case 'week':
    case 'time':
      return {
        name: halField.name,
        type: halField.type,
        value: halField.value,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        min: halField.min,
        max: halField.max,
        step: halField.step,
      };
    case 'number':
    case 'range':
      return {
        name: halField.name,
        type: halField.type,
        value: halField.value ? +halField.value : undefined,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        min: halField.min,
        max: halField.max,
        step: halField.step,
      };
    case 'datetime-local':
      return {
        name: halField.name,
        type: halField.type,
        value: halField.value ? new Date(halField.value) : undefined,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        min: halField.min,
        max: halField.max,
        step: halField.step,
      };
    case 'color':
      return {
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        value: halField.value,
      };
    case 'radio':
    case 'checkbox':
      return {
        name: halField.name,
        type: halField.type,
        required: halField.required || false,
        readOnly: halField.readOnly || false,
        label: halField.prompt,
        value: !!halField.value,
      };
  }
}

function isInlineOptions(
  options: HalFormsSimpleProperty['options']
): options is HalFormsOptionsInline {
  return (options as SafeAny).inline !== undefined;
}
