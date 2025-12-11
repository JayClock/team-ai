import { SafeAny } from '../archtype/safe-any.js';
import { RequestOptions, Resource } from './resource.js';
import { Form } from '../form/form.js';
import { z } from 'zod';
import { Link, LinkVariables } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';

export abstract class BaseResource<TEntity extends Entity>
  implements Resource<TEntity>
{
  protected constructor(
    protected readonly client: ClientInstance,
    protected readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {}

  protected async httpRequest(
    link: Link,
    form?: Form
  ): Promise<State<TEntity>> {
    const options = this.getRequestOption(link);

    if (form) {
      this.verifyFormData(form, options.body);
    }

    const response = await this.client.fetcher.fetchOrThrow(link, options);
    return this.client.getStateForResponse(response.url, response, link.rel);
  }

  protected initRequestOptionsWithRel(
    rel: string,
    requestOptions: RequestOptions
  ): void {
    this.optionsMap.set(rel, requestOptions);
  }

  withGet(): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'GET' });
    return this;
  }

  withPost(data: Record<string, SafeAny>): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'POST', body: data });
    return this;
  }

  withPut(data: Record<string, SafeAny>): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'PUT', body: data });
    return this;
  }

  withPatch(data: Record<string, SafeAny>): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'PATCH', body: data });
    return this;
  }

  withDelete(): Resource<TEntity> {
    const { rel, options } = this.getCurrentOptions();
    this.optionsMap.set(rel, { ...options, method: 'DELETE' });
    return this;
  }

  private verifyFormData(form: Form, body: Record<string, SafeAny> = {}) {
    const shape: Record<string, SafeAny> = {};

    for (const field of form.fields) {
      let shapeElement: z.ZodType;

      switch (field.type) {
        case 'text':
          shapeElement = z.string();
          break;
        case 'url':
          shapeElement = z.url();
          break;
        default:
          shapeElement = z.string();
      }

      if (field.readOnly) {
        shapeElement = shapeElement.readonly();
      }
      if (!field.required) {
        shapeElement = shapeElement.optional();
      }
      shape[field.name] = shapeElement;
    }

    try {
      const schema = z.object(shape);
      schema.parse(body);
    } catch {
      throw new Error('Invalid');
    }
  }

  private getRequestOption(link: Link) {
    return this.optionsMap.get(link.rel) ?? {};
  }

  abstract follow<K extends keyof TEntity['links']>(
    rel: K,
    variables?: LinkVariables
  ): Resource<TEntity['links'][K]>;

  abstract request(): Promise<State<TEntity>>;

  abstract getCurrentOptions(): {
    rel: string;
    options: RequestOptions;
  };
}
