import { Form } from '../form/form.js';
import { Entity } from '../archtype/entity.js';
import { State } from '../state/state.js';
import { Field } from '../form/field.js';
import { SafeAny } from '../archtype/safe-any.js';
import { ClientInstance } from '../client-instance.js';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import * as qs from 'querystring';


/**
 * Represents an executable hypermedia action (form submission).
 *
 * Actions are discovered from HAL-Forms templates and enable HATEOAS-driven
 * state transitions. They encapsulate the HTTP method, target URI, content
 * type, and available form fields.
 *
 * @typeParam TEntity - The expected entity type of the response
 *
 * @example
 * ```typescript
 * // Discover and execute an action
 * if (state.hasActionFor('create-post')) {
 *   const action = state.actionFor('create-post');
 *
 *   // Check available fields
 *   const titleField = action.field('title');
 *   console.log(titleField?.required);
 *
 *   // Submit the action
 *   const result = await action.submit({
 *     title: 'Hello World',
 *     content: 'My first post'
 *   });
 * }
 * ```
 *
 * @see {@link State.actionFor} for discovering actions
 * @see {@link Form} for the underlying form structure
 *
 * @category Resource
 */
export interface Action<TEntity extends Entity> extends Form {
  /**
   * Executes the action by submitting form data.
   *
   * @param formData - Key-value pairs for form fields
   * @returns A Promise resolving to the response state
   * @throws {@link HttpError} When the server returns an error response
   */
  submit(formData: Record<string, SafeAny>): Promise<State<TEntity>>;

  /**
   * Retrieves a form field by name.
   *
   * @param name - The field name
   * @returns The Field object or `undefined` if not found
   */
  field(name: string): Field | undefined;

  /**
   * Schema generated from form fields.
   *
   * Uses the Standard Schema interface so validation engines are pluggable.
   */
  formSchema: ActionFormSchema;
}

export type ActionFormSchema = StandardSchemaV1<
  Record<string, SafeAny>,
  Record<string, SafeAny>
>;

/**
 * Plugin interface for generating action form schemas.
 */
export interface SchemaPlugin {
  createSchema(fields: Field[]): ActionFormSchema;
}

export type ActionSchemaPlugin = SchemaPlugin;

/**
 * Default schema plugin with no validation.
 *
 * If you need runtime validation, pass a custom plugin (e.g. zod plugin).
 */
export const defaultSchemaPlugin: SchemaPlugin = {
  createSchema(fields: Field[]): ActionFormSchema {
    void fields;
    return {
      '~standard': {
        version: 1,
        vendor: 'hateoas-resource-noop',
        validate(value) {
          return { value: value as Record<string, SafeAny> };
        },
      },
    };
  },
};

export const standardActionSchemaPlugin = defaultSchemaPlugin;

/**
 * Default implementation of the Action interface.
 *
 * Handles form submission with support for `application/json` and
 * `application/x-www-form-urlencoded` content types.
 *
 * @typeParam TEntity - The expected entity type of the response
 * @internal
 * @category Resource
 */

export class SimpleAction<TEntity extends Entity> implements Action<TEntity> {
  uri: string;
  name: string;
  title?: string | undefined;
  method: string;
  contentType: string;
  fields: Field[];
  formSchema: ActionFormSchema;

  constructor(
    private client: ClientInstance,
    private form: Form,
    schemaPlugin: SchemaPlugin = defaultSchemaPlugin,
  ) {
    this.uri = this.form.uri;
    this.name = this.form.name;
    this.title = this.form.title;
    this.method = this.form.method;
    this.contentType = this.form.contentType;
    this.fields = this.form.fields;
    this.formSchema = schemaPlugin.createSchema(this.fields);
  }

  field(name: string): Field | undefined {
    return this.fields.find((field) => field.name === name);
  }

  async submit(formData: Record<string, SafeAny>): Promise<State<TEntity>> {
    const uri = new URL(this.uri, this.client.bookmarkUri);

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
      headers: new Headers({
        'Content-Type': this.contentType,
      }),
    });

    return this.client.getStateForResponse(
      { rel: '', href: uri.toString(), context: this.client.bookmarkUri },
      response,
    );
  }
}

/**
 * Error thrown when a requested action cannot be found.
 *
 * This occurs when calling `state.actionFor(rel)` with a link relation
 * that has no associated HAL-Forms template.
 *
 * @category Resource
 */
export class ActionNotFound extends Error {
  override name = 'ActionNotFound';
}
