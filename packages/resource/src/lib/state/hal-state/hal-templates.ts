import { Links } from '../../links/links.js';
import { SafeAny } from '../../archtype/safe-any.js';
import { HalLink, HalResource } from 'hal-types';
import { Form } from '../../form/form.js';
import { halProperty } from './hal-property.js';

export const halTemplates = {
  parse(
    links: Links<SafeAny>,
    templates: HalResource['_templates'] = {}
  ): Form[] {
    return Object.values(templates).map((template) => ({
      title: template.title,
      method: template.method,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      uri: template.target ?? (links.get('self')! as HalLink).href,
      contentType: template.contentType ?? 'application/json',
      fields:
        template.properties?.map((property) => halProperty.parse(property)) ||
        [],
    }));
  },
};
