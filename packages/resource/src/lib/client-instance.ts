import { Entity } from './archtype/entity.js';
import { Resource } from './resource/resource.js';
import { inject, injectable } from 'inversify';
import { TYPES } from './archtype/injection-types.js';
import { Client } from './create-client.js';
import { Link, NewLink } from './links/link.js';
import { Fetcher, FetchMiddleware } from './http/fetcher.js';
import { State, StateFactory } from './state/state.js';
import { HalStateFactory } from './state/hal-state/hal-state.factory.js';
import type { Config } from './archtype/config.js';
import { BinaryStateFactory } from './state/binary-state/binary-state.factory.js';
import { parseContentType } from './http/util.js';
import { resolve } from './util/uri.js';
import { SafeAny } from './archtype/safe-any.js';
import type { Cache } from './cache/cache.js';
import { StreamStateFactory } from './state/stream-state/stream-state.factory.js';
import { acceptMiddleware } from './middlewares/accept-header.js';
import { cacheMiddleware } from './middlewares/cache.js';
import { warningMiddleware } from './middlewares/warning.js';

/**
 * Internal Client implementation with dependency injection.
 *
 * Manages resource creation, state caching, content-type negotiation,
 * and middleware execution. This is the concrete implementation of
 * the {@link Client} interface.
 *
 * @internal
 * @category Client
 */
@injectable()
export class ClientInstance implements Client {
  /**
   * Base URI for the API. All relative URIs are resolved against this.
   */
  readonly bookmarkUri: string;

  /**
   * Cache of Resource instances keyed by absolute URI.
   * Ensures each URI has only one Resource instance.
   */
  readonly resources = new Map<string, Resource<SafeAny>>();
  readonly cache: Cache;

  constructor(
    @inject(TYPES.Fetcher)
    readonly fetcher: Fetcher,
    @inject(TYPES.Config)
    readonly config: Config,
    @inject(TYPES.Cache)
    cache: Cache,
    @inject(TYPES.HalStateFactory)
    readonly halStateFactory: HalStateFactory,
    @inject(TYPES.BinaryStateFactory)
    readonly binaryStateFactory: BinaryStateFactory,
    @inject(TYPES.StreamStateFactory)
    streamStateFactory: StreamStateFactory,
  ) {
    this.bookmarkUri = config.baseURL;
    this.cache = config.cache ?? cache;

    this.contentTypeMap = {
      'application/prs.hal-forms+json': [halStateFactory, '1.0'],
      'application/hal+json': [halStateFactory, '0.9'],
      // 'application/vnd.api+json': [jsonApiStateFactory, '0.8'],
      // 'application/vnd.siren+json': [sirenStateFactory, '0.8'],
      // 'application/vnd.collection+json': [cjStateFactory, '0.8'],
      'application/json': [halStateFactory, '0.7'],
      // 'text/html': [htmlStateFactory, '0.6'],
      'text/event-stream': [streamStateFactory, '0.5'],
    };

    this.use(acceptMiddleware(this));
    this.use(cacheMiddleware(this));
    this.use(warningMiddleware());
  }

  /**
   * Content-type to StateFactory mapping.
   *
   * Maps MIME types to their corresponding state factories and quality values.
   * The quality value (0-1) is used in Accept header negotiation.
   */
  contentTypeMap: {
    [mimeType: string]: [StateFactory, string];
  } = {};

  /**
   * Navigates to a resource by URI or link.
   *
   * @typeParam TEntity - The entity type for the target resource
   * @param uri - Path relative to baseURL or a NewLink object
   * @returns A Resource instance (reused if already exists)
   */
  go<TEntity extends Entity>(uri?: string | NewLink): Resource<TEntity> {
    let link: Link;
    if (uri === undefined) {
      link = { rel: '', context: this.bookmarkUri, href: '' };
    } else if (typeof uri === 'string') {
      link = { rel: '', context: this.bookmarkUri, href: uri };
    } else {
      const uriWithOptionalContext = uri as NewLink & Partial<Link>;
      link = {
        ...uriWithOptionalContext,
        context: uriWithOptionalContext.context ?? this.bookmarkUri,
      };
    }
    const absoluteUri = resolve(link);
    if (!this.resources.has(absoluteUri)) {
      const resource = new Resource<TEntity>(this, link);
      this.resources.set(absoluteUri, resource);
      return resource;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.resources.get(absoluteUri)!;
  }

  use(middleware: FetchMiddleware, origin = '*') {
    this.fetcher.use(middleware, origin);
  }

  async getStateForResponse<TEntity extends Entity>(
    link: Link,
    response: Response,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const contentType = parseContentType(response.headers.get('Content-Type')!);

    if (!contentType || response.status === 204) {
      return this.binaryStateFactory.create<TEntity>(
        this,
        link,
        response,
      );
    }

    if (contentType in this.contentTypeMap) {
      return this.contentTypeMap[contentType][0].create<TEntity>(
        this,
        link,
        response,
      );
    } else if (contentType.match(/^application\/[A-Za-z-.]+\+json/)) {
      return this.halStateFactory.create<TEntity>(
        this,
        link,
        response,
      );
    }

    return this.binaryStateFactory.create<TEntity>(
      this,
      link,
      response,
    );
  }
  /**
   * Caches a State object and emits update events.
   *
   * Flattens embedded states, stores all in cache, and notifies
   * any Resource instances listening for updates.
   *
   * @param state - The State object to cache
   */
  cacheState(state: State) {
    // Flatten the list of state objects.
    const newStates = this.flattenState(state);

    // Store all new caches
    for (const nState of newStates) {
      this.cache.store(nState);
    }

    // Emit 'update' events
    for (const nState of newStates) {
      const resource = this.resources.get(nState.uri);
      if (resource) {
        // We have a resource for this object, notify it as well.
        resource.emit('update', nState);
      }
    }
  }

  /**
   * Take a State object, find all it's collection resources and return a flat
   * array of all resources at any depth.
   */
  private flattenState(
    state: State,
    result: Set<State> = new Set<State>(),
  ): Set<State> {
    result.add(state);
    for (const _ of state.collection) {
      this.flattenState(_, result);
    }
    return result;
  }

  /**
   * Clears cache for specified resources and emits events.
   *
   * Emits 'stale' events for resources that need refetching,
   * and 'delete' events for resources that were deleted.
   *
   * @param staleUris - URIs that are stale and need refetching
   * @param deletedUris - URIs that were deleted
   */
  clearResourceCache(staleUris: string[], deletedUris: string[]) {
    const stale = new Set<string>();
    const deleted = new Set<string>();
    for (const uri of staleUris) {
      stale.add(resolve(this.bookmarkUri, uri));
    }
    for (const uri of deletedUris) {
      stale.add(resolve(this.bookmarkUri, uri));
      deleted.add(resolve(this.bookmarkUri, uri));
    }

    for (const uri of stale) {
      this.cache.delete(uri);

      const resource = this.resources.get(uri);
      if (resource) {
        if (deleted.has(uri)) {
          resource.emit('delete');
        } else {
          resource.emit('stale');
        }
      }
    }
  }
}
