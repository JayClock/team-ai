import { Entity } from '../../archtype/entity.js';
import { State } from '../state.js';
import { StateCollection } from '../state-collection.js';
import { Form } from '../../form/form.js';
import { HalLink, HalResource } from 'hal-types';
import { Link } from '../../links/link.js';
import { ClientInstance } from '../../client-instance.js';
import { halLinks } from './hal-links.js';
import { halTemplates } from './hal-templates.js';
import { BaseState } from '../base-state.js';

type StateInit = {
  uri: string;
  client: ClientInstance;
  halResource: HalResource;
  rel?: string;
};

export class HalState<TEntity extends Entity = Entity>
  extends BaseState<TEntity>
  implements State<TEntity>
{
  readonly uri: string;
  readonly data: TEntity['data'];
  readonly collection: StateCollection<TEntity>;

  private readonly forms: Form[];
  private readonly embedded: Record<string, HalResource | HalResource[]>;

  constructor(private init: StateInit) {
    super({
      client: init.client,
      links: halLinks.parse(init.halResource._links),
    });
    this.uri = init.uri;
    this.client = init.client;
    const { _links, _embedded, _templates, ...pureData } = init.halResource;
    this.data = pureData;
    this.embedded = _embedded ?? {};
    this.forms = halTemplates.parse(this.links, _templates);
    this.collection = init.rel
      ? (this.embedded[init.rel] ?? []).map(
          (embedded: HalResource) =>
            new HalState({
              client: this.client,
              uri: (embedded._links?.self as HalLink).href,
              halResource: embedded,
            })
        )
      : [];
  }

  getForm<K extends keyof TEntity['links']>(rel: K) {
    const link = this.links.get(rel as string);
    if (!link) {
      return undefined;
    }
    return this.forms.find(
      (form) => form.uri === link.href && form.method === link.type
    );
  }

  getEmbedded(rel: string): HalResource | HalResource[] {
    return this.embedded[rel];
  }

  getLink<K extends keyof TEntity['links']>(rel: K): Link | undefined {
    return this.links.get(rel);
  }

  clone(): State<TEntity> {
    return new HalState(this.init);
  }
}
