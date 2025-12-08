import { parseTemplate } from 'url-template';
import { HalState } from '../state/hal-state.js';
import { SafeAny } from '../archtype/safe-any.js';
import { HalResource } from 'hal-types';
import { RequestOptions } from './resource.js';
import { Axios } from 'axios';
import queryString from 'query-string';
import { Form } from '../form/form.js';
import { z } from 'zod';
import { Link } from '../links/link.js';

export class BaseResource {
  constructor(
    protected readonly axios: Axios,
    protected readonly optionsMap: Map<string, RequestOptions> = new Map()
  ) {}

  protected async httpRequest(link: Link, form?: Form) {
    const { query, body } = this.getRequestOption(link);
    let url;
    if (link.templated) {
      url = parseTemplate(link.href).expand(query ?? {});
    } else {
      url = queryString.stringifyUrl({
        url: link.href,
        query,
      });
    }

    if (form) {
      this.verifyFormData(form, body);
    }

    const response = await this.axios.request({
      url: url,
      method: link.type,
      data: body,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return HalState.create<SafeAny>(
      this.axios,
      url,
      (await response.data) as HalResource,
      link.rel
    );
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
