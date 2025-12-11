import { Entity } from './archtype/entity.js';
import { LinkResource } from './resource/link-resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Resource } from './resource/resource.js';
import { Client } from './create-client.js';
import { Link, NewLink } from './links/link.js';
import { Fetcher } from './http/fetcher.js';
import { State, StateFactory } from './state/state.js';
import { HalStateFactory } from './state/hal-state/hal-state.factory.js';
import type { Config } from './archtype/config.js';
import { BinaryStateFactory } from './state/binary-state/binary-state.factory.js';
import { parseContentType } from './http/util.js';
import { resolve } from './util/uri.js';
import { SafeAny } from './archtype/safe-any.js';

@injectable()
export class ClientInstance implements Client {
  /**
   * All relative urls will by default use the bookmarkUri to
   * expand. It should usually be the starting point of your
   * API
   */
  readonly bookmarkUri: string;

  /**
   * The cache for 'Resource' objects. Each unique uri should
   * only ever get 1 associated resource.
   */
  readonly resources = new Map<string, Resource<SafeAny>>();

  constructor(
    @inject(TYPES.Fetcher)
    readonly fetcher: Fetcher,
    @inject(TYPES.Config)
    readonly config: Config,
    @inject(TYPES.HalStateFactory)
    private readonly halStateFactory: HalStateFactory,
    @inject(TYPES.BinaryStateFactory)
    private readonly binaryStateFactory: BinaryStateFactory
  ) {
    this.bookmarkUri = config.baseURL;

    this.contentTypeMap = {
      'application/prs.hal-forms+json': [halStateFactory, '1.0'],
      'application/hal+json': [halStateFactory, '0.9'],
      // 'application/vnd.api+json': [jsonApiStateFactory, '0.8'],
      // 'application/vnd.siren+json': [sirenStateFactory, '0.8'],
      // 'application/vnd.collection+json': [cjStateFactory, '0.8'],
      'application/json': [halStateFactory, '0.7'],
      // 'text/html': [htmlStateFactory, '0.6'],
    };
  }

  /**
   * Supported content types
   *
   * Each content-type has a 'factory' that turns a HTTP response
   * into a State object.
   *
   * The last value in the array is the 'q=' value, used in Accept
   * headers. Higher means higher priority.
   */
  contentTypeMap: {
    [mimeType: string]: [StateFactory, string];
  } = {};

  /**
   * Transforms a fetch Response to a State object.
   */
  go<TEntity extends Entity>(uri?: string | NewLink): Resource<TEntity> {
    let link: Link;
    if (uri === undefined) {
      link = { rel: '', context: this.bookmarkUri, href: '' };
    } else if (typeof uri === 'string') {
      link = { rel: '', context: this.bookmarkUri, href: uri };
    } else {
      link = { ...uri, context: this.bookmarkUri };
    }
    const absoluteUri = resolve(link);
    if (!this.resources.has(absoluteUri)) {
      const resource: Resource<SafeAny> = new LinkResource(this, link);
      this.resources.set(absoluteUri, resource);
      return resource;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.resources.get(absoluteUri)!;
  }

  async getStateForResponse<TEntity extends Entity>(
    uri: string,
    response: Response,
    rel?: string
  ): Promise<State<TEntity>> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const contentType = parseContentType(response.headers.get('Content-Type')!);

    if (!contentType || response.status === 204) {
      return this.binaryStateFactory.create<TEntity>(this, uri, response);
    }

    if (contentType in this.contentTypeMap) {
      return this.contentTypeMap[contentType][0].create<TEntity>(
        this,
        uri,
        response,
        rel
      );
    } else if (contentType.match(/^application\/[A-Za-z-.]+\+json/)) {
      return this.halStateFactory.create<TEntity>(this, uri, response, rel);
    }

    return this.binaryStateFactory.create<TEntity>(this, uri, response);
  }
}
