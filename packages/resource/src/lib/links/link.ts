import { HalLink } from 'hal-types';

export interface Link extends HalLink {
  rel: string;
}

/**
 * A key->value map of variables to place in a templated link
 */
export type LinkVariables = {
  [key: string]: string | number | string[] | number[];
};
