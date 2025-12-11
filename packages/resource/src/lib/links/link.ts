import { LinkHints } from 'hal-types';

export type Link = {
  /**
   * Target URI
   */
  href: string;

  /**
   * Context URI.
   *
   * Used to resolve relative URIs
   */
  context: string;

  /**
   * Relation type
   */
  rel: string;

  /**
   * Link title
   */
  title?: string;

  /**
   * Content type hint of the target resource
   */
  type?: string;

  /**
   * Anchor.
   *
   * This describes where the link is linked from, from for example
   * a fragment in the current document
   */
  anchor?: string;

  /**
   * Language of the target resource
   */
  hreflang?: string;

  /**
   * HTML5 media attribute
   */
  media?: string;

  /**
   * If templated is set to true, the href is a templated URI.
   */
  templated?: boolean;

  /**
   * Link hints, as defined in draft-nottingham-link-hint
   */
  hints?: LinkHints;

  /**
   * Link name
   *
   * This is sometimes used as a machine-readable secondary key for links.
   *
   * This is at least used in HAL, but there may be other formats:
   *
   * @see https://datatracker.ietf.org/doc/html/draft-kelly-json-hal-06#section-5.5
   */
  name?: string;
};

export type NewLink = Omit<Link, 'context'>;
/**
 * A key->value map of variables to place in a templated link
 */
export type LinkVariables = {
  [key: string]: string | number | string[] | number[];
};
