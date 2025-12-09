import { Entity } from '../archtype/entity.js';
import { Links } from '../links/links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import {
  HalFormsOptionsInline,
  HalFormsProperty,
  HalFormsSimpleProperty,
  HalLink,
  HalResource,
} from 'hal-types';
import { Field } from '../form/field.js';
import { SafeAny } from '../archtype/safe-any.js';
import { Resource } from '../resource/resource.js';
import { StateResource } from '../resource/state-resource.js';
import { Link } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';

type StateInit = {
  uri: string;
  client: ClientInstance;
  halResource: HalResource;
  rel?: string;
};

export class HalState<TEntity extends Entity = Entity>
  implements State<TEntity>
{
  readonly uri: string;
  readonly client: ClientInstance;
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;
  readonly links: Links<TEntity['links']>;
  readonly timestamp = Date.now();

  private readonly forms: Form[];
  private readonly embedded: Record<string, HalResource | HalResource[]>;

  private constructor(private init: StateInit) {
    this.uri = init.uri;
    this.client = init.client;
    const { _links, _embedded, _templates, ...pureData } = init.halResource;
    this.data = pureData;
    this.links = this.parseHalLinks(_links);
    this.embedded = _embedded ?? {};
    this.forms = this.parseHalTemplates(this.links, _templates);
    this.collection = init.rel
      ? (this.embedded[init.rel] ?? []).map((embedded: HalResource) =>
          HalState.create(
            this.client,
            (embedded._links?.self as HalLink).href,
            embedded
          )
        )
      : [];
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new StateResource(this.client, this, [link.rel]);
    }
    throw new Error(`rel ${rel as string} is not exited`);
  }

  getForm<K extends keyof TEntity['links']>(rel: K) {
    const link = this.links.get(rel as string);
    if (!link) {
      return undefined;
    }
    return this.forms.find(
      (form) => form.uri === link.href && form.method === link.type
    );
  }

  getEmbedded(rel: string): HalResource | HalResource[] {
    return this.embedded[rel];
  }

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined {
    return this.links.get(rel);
  }

  clone(): State<TEntity> {
    return new HalState(this.init);
  }

  /**
   * Factory method to create HalState instance
   */
  static create<TEntity extends Entity>(
    client: ClientInstance,
    uri: string,
    halResource: HalResource,
    rel?: string
  ): State<TEntity> {
    return new HalState<TEntity>({
      client,
      uri,
      halResource,
      rel,
    });
  }

  /**
   * Parse HAL links
   */
  private parseHalLinks<TLinks extends Record<string, SafeAny>>(
    halLinks: HalResource['_links']
  ): Links<TLinks> {
    const links = new Links<TLinks>();
    for (const [key, value] of Object.entries(halLinks ?? [])) {
      const linkList = Array.isArray(value) ? value : [value];
      links.add(
        linkList.map((item) => ({
          ...item,
          rel: key,
          type: item.type ?? 'GET',
        }))
      );
    }
    return links;
  }

  /**
   * Parse HAL templates
   */
  private parseHalTemplates(
    links: Links<SafeAny>,
    templates: HalResource['_templates'] = {}
  ): Form[] {
    return Object.values(templates).map((template) => ({
      title: template.title,
      method: template.method,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      uri: template.target ?? (links.get('self')! as HalLink).href,
      contentType: template.contentType ?? 'application/json',
      fields:
        template.properties?.map((property) => this.parseHalField(property)) ||
        [],
    }));
  }

  /**
   * Parse HAL form fields
   */
  private parseHalField(halField: HalFormsProperty): Field {
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
            value: (halField.options.selectedValues ||
              halField.value) as SafeAny,
          };

          const labelField = halField.options.promptField || 'prompt';
          const valueField = halField.options.valueField || 'value';
          if (this.isInlineOptions(halField.options)) {
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

  /**
   * Check if options are inline options
   */
  private isInlineOptions(
    options: HalFormsSimpleProperty['options']
  ): options is HalFormsOptionsInline {
    return (options as SafeAny).inline !== undefined;
  }
}
