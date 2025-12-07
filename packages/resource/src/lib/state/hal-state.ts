import { Client } from '../client.js';
import { Entity } from '../archtype/entity.js';
import { Link, Links } from '../links.js';
import { State } from './state.js';
import { StateCollection } from './state-collection.js';
import { Form } from '../form/form.js';
import { Resource } from '../resource/resource.js';
import {
  HalFormsOptionsInline,
  HalFormsProperty,
  HalFormsSimpleProperty,
  HalLink,
  HalResource,
} from 'hal-types';
import { Field } from '../form/field.js';
import { SafeAny } from '../archtype/safe-any.js';

type StateInit<TEntity extends Entity> = {
  uri: string;
  client: Client;
  data: TEntity['data'];
  links: Links<TEntity['links']>;
  collection?: State[];
  forms?: Form[];
  embedded?: Record<string, State | State[]>;
};

export class HalState<TEntity extends Entity = Entity>
  implements State<TEntity>
{
  readonly uri: string;
  readonly client: Client;
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;
  readonly links: Links<TEntity['links']>;
  private readonly forms: Form[];
  private readonly embedded: Record<string, State | State[]>;

  constructor(private init: StateInit<TEntity>) {
    this.uri = this.init.uri;
    this.client = this.init.client;
    this.data = this.init.data;
    this.links = this.init.links;
    this.collection = (this.init.collection || []) as StateCollection<TEntity>;
    this.forms = this.init.forms || [];
    this.embedded = this.init.embedded || {};
  }

  follow<K extends keyof TEntity['links']>(
    rel: K
  ): Resource<TEntity['links'][K]> {
    const link = this.links.get(rel as string);
    if (link) {
      return new Resource(this.client, link, [rel as string]);
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

  getEmbedded(rel: string): State | State[] {
    return this.embedded[rel];
  }

  getLink(rel: string): Link | undefined {
    return this.links.get(rel);
  }

  clone(): State<TEntity> {
    return new HalState(this.init);
  }

  /**
   * 创建 HalState 实例的工厂方法
   */
  static createHalState<TEntity extends Entity>(
    client: Client,
    uri: string,
    halResource: HalResource,
    collectionRel?: string
  ): State<TEntity> {
    const { _links, _embedded, _templates, ...pureData } = halResource;
    const links = HalState.parseHalLinks(_links);
    const embedded = HalState.parseHalEmbedded(client, _embedded);
    return new HalState<TEntity>({
      client,
      uri,
      data: pureData,
      links,
      collection: collectionRel
        ? (embedded[collectionRel] as StateCollection<TEntity>) ?? []
        : [],
      forms: HalState.parseHalTemplates(links, _templates),
      embedded: embedded,
    });
  }

  /**
   * 解析 HAL 链接
   */
  private static parseHalLinks<TLinks extends Record<string, SafeAny>>(
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

  /**
   * 解析 HAL 模板
   */
  private static parseHalTemplates(
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
        template.properties?.map((property) => HalState.parseHalField(property)) || [],
    }));
  }

  /**
   * 解析 HAL 嵌入资源
   */
  private static parseHalEmbedded(
    client: Client,
    embedded: HalResource['_embedded'] = {}
  ): Record<string, State | State[]> {
    const res: Record<string, State | State[]> = {};
    for (const [rel, resource] of Object.entries(embedded)) {
      if (Array.isArray(resource)) {
        res[rel] = resource.map((data) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          HalState.createHalState(client, (data._links!.self as HalLink).href, data)
        );
      } else {
        res[rel] = HalState.createHalState(
          client,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          (resource._links!.self as HalLink).href,
          resource
        );
      }
    }
    return res;
  }

  /**
   * 解析 HAL 表单字段
   */
  private static parseHalField(halField: HalFormsProperty): Field {
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
          if (HalState.isInlineOptions(halField.options)) {
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
   * 检查选项是否为内联选项
   */
  private static isInlineOptions(
    options: HalFormsSimpleProperty['options']
  ): options is HalFormsOptionsInline {
    return (options as SafeAny).inline !== undefined;
  }
}
