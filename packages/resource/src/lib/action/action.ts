import { Form } from '../form/form.js';
import { Entity } from '../archtype/entity.js';
import { State } from '../state/state.js';
import { Field } from '../form/field.js';
import { SafeAny } from '../archtype/safe-any.js';
import { ClientInstance } from '../client-instance.js';
import * as qs from 'querystring';

/**
 * An action represents a hypermedia form submission or action.
 */
export interface Action<TEntity extends Entity> extends Form {
  /**
   * Execute the action or submit the form.
   */
  submit(formData: Record<string, SafeAny>): Promise<State<TEntity>>;

  /**
   * Return a field by name.
   */
  field(name: string): Field | undefined;
}

/**
 * An action represents a hypermedia form submission or action.
 */

export class SimpleAction<TEntity extends Entity> implements Action<TEntity> {
  uri: string;
  name: string;
  title?: string | undefined;
  method: string;
  contentType: string;
  fields: Field[];

  constructor(
    private client: ClientInstance,
    private form: Form,
  ) {
    this.uri = this.form.uri;
    this.name = this.form.name;
    this.title = this.form.title;
    this.method = this.form.method;
    this.contentType = this.form.contentType;
    this.fields = this.form.fields;
  }

  field(name: string): Field | undefined {
    return this.fields.find((field) => field.name === name);
  }

  async submit(formData: Record<string, SafeAny>): Promise<State<TEntity>> {
    const uri = new URL(this.uri);

    if (this.method === 'GET') {
      uri.search = qs.stringify(formData);
      const resource = this.client.go<TEntity>(uri.toString());
      return resource.get();
    }
    let body;
    switch (this.contentType) {
      case 'application/x-www-form-urlencoded':
        body = qs.stringify(formData);
        break;
      case 'application/json':
        body = JSON.stringify(formData);
        break;
      default:
        throw new Error(
          `Serializing mimetype ${this.form.contentType} is not yet supported in actions`,
        );
    }
    const response = await this.client.fetcher.fetchOrThrow(uri.toString(), {
      method: this.method,
      body,
      headers: {
        'Content-Type': this.contentType,
      },
    });

    return this.client.getStateForResponse(
      { rel: '', href: uri.toString(), context: this.client.bookmarkUri },
      response,
    );
  }
}

export class ActionNotFound extends Error {

}
