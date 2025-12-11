import { Link, LinkVariables } from '../links/link.js';
import { parseTemplate } from 'url-template';
import queryString from 'query-string';
import { resolve } from './uri.js';

export function expand(link: Link, query: LinkVariables | undefined) {
  let path: string;
  if (link.templated) {
    path = parseTemplate(link.href).expand(query ?? {});
  } else {
    path = queryString.stringifyUrl({
      url: link.href,
      query,
    });
  }
  return resolve(link.context, path);
}
