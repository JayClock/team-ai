import { LinkHints } from 'hal-types';

/**
 * Represents a hypermedia link in HAL format.
 *
 * Links are the foundation of HATEOAS navigation, connecting resources
 * and enabling discovery of related resources and available actions.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/draft-kelly-json-hal-06 | HAL Specification}
 *
 * @category Resource
 */
export type Link = {
  /**
   * Target URI of the linked resource.
   *
   * May be a URI template if `templated` is true.
   */
  href: string;

  /**
   * Context URI for resolving relative hrefs.
   */
  context: string;

  /**
   * Link relation type (e.g., 'self', 'next', 'author').
   *
   * @see {@link https://www.iana.org/assignments/link-relations | IANA Link Relations}
   */
  rel: string;

  /**
   * Human-readable link title.
   */
  title?: string;

  /**
   * Expected content type of the target resource.
   */
  type?: string;

  /**
   * Anchor for fragment-based links within a document.
   */
  anchor?: string;

  /**
   * Language of the target resource.
   */
  hreflang?: string;

  /**
   * Media query hint for the target resource.
   */
  media?: string;

  /**
   * Indicates if href is a URI Template (RFC 6570).
   *
   * When true, use template variables to expand the URI.
   */
  templated?: boolean;

  /**
   * Extended link hints per draft-nottingham-link-hint.
   */
  hints?: LinkHints;

  /**
   * Secondary identifier for the link.
   *
   * Used in HAL for distinguishing multiple links with the same rel.
   *
   * @see {@link https://datatracker.ietf.org/doc/html/draft-kelly-json-hal-06#section-5.5 | HAL name property}
   */
  name?: string;
};

/**
 * Link without context (for creating new links).
 *
 * @category Resource
 */
export type NewLink = Omit<Link, 'context'>;

/**
 * Template variables for URI Template expansion.
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6570 | RFC 6570 URI Templates}
 *
 * @category Resource
 */
export type LinkVariables = {
  [key: string]: string | number | string[] | number[];
};

/**
 * Error thrown when attempting to follow a relation that does not exist.
 *
 * @category Resource
 */
export class LinkNotFound extends Error {
  override name = 'LinkNotFound';
}
