import { SafeAny } from '../archtype/safe-any.js';
import { RequestOptions } from './resource.js';
import { Form } from '../form/form.js';
import { z } from 'zod';
import { Link } from '../links/link.js';
import { ClientInstance } from '../client-instance.js';
import { State } from '../state/state.js';
import { Entity } from '../archtype/entity.js';

export class BaseResource<TEntity extends Entity> {
  constructor(
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
}
