import { Field } from './field.js';

export type Form = {
  /**
   * What url to post the form to.
   */
  uri: string;

  /**
   * Action name.
   *
   * Some formats call this the 'rel'
   */
  name: string;

  /**
   * Form title.
   *
   * Should be human-friendly.
   */
  title?: string;

  /**
   * The HTTP method to use
   */
  method: string;

  /**
   * The contentType to use for the form submission
   */
  contentType: string;

  /**
   * Returns the list of fields associated to an action
   */
  fields: Field[];
};
