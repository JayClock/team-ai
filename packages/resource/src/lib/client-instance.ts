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
    @inject(TYPES.Cache)
    readonly cache: Cache,
    @inject(TYPES.HalStateFactory)
    readonly halStateFactory: HalStateFactory,
    @inject(TYPES.BinaryStateFactory)
    readonly binaryStateFactory: BinaryStateFactory,
    @inject(TYPES.StreamStateFactory)
    streamStateFactory: StreamStateFactory,
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
      'text/event-stream': [streamStateFactory, '0.5'],
    };

    this.use(acceptMiddleware(this));
    this.use(cacheMiddleware(this));
    this.use(warningMiddleware());
  }

  /**
   * cacheDependencies contains all cache relationships between
   * resources.
   *
   * This lets a user (for example) let a resource automatically
   * expire, if another one expires.
   *
   * A server can populate this list using the `inv-by' link.
   *
   */
  private cacheDependencies: Map<string, Set<string>> = new Map();

  /**
   * Adds a cache dependency between two resources.
   *
   * If the 'target' resource ever expires, it will cause 'dependentUri' to
   * also expire.
   *
   * Both argument MUST be absolute urls.
   */
  private addCacheDependency(targetUri: string, dependentUri: string): void {
    if (this.cacheDependencies.has(targetUri)) {
      this.cacheDependencies.get(targetUri)?.add(dependentUri);
    } else {
      this.cacheDependencies.set(targetUri, new Set([dependentUri]));
    }
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
  go<TEntity extends Entity>(
    uri?: string | NewLink,
    prevUri?: string,
  ): Resource<TEntity> {
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
      const resource = new Resource<TEntity>(this, link, prevUri);
      this.resources.set(absoluteUri, resource);
      return resource as Resource<TEntity>;
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
      return this.binaryStateFactory.create<TEntity>(this, link, response);
    }

    if (contentType in this.contentTypeMap) {
      return this.contentTypeMap[contentType][0].create<TEntity>(
        this,
        link,
        response,
      );
    } else if (contentType.match(/^application\/[A-Za-z-.]+\+json/)) {
      return this.halStateFactory.create<TEntity>(this, link, response);
    }

    return this.binaryStateFactory.create<TEntity>(this, link, response);
  }
  /**
   * Caches a State object
   *
   * This function will also emit 'update' events to resources, and store all
   * embedded states.
   */
  cacheState(state: State) {
    // Flatten the list of state objects.
    const newStates = this.flattenState(state);

    // Register all cache dependencies.
    for (const nState of newStates) {
      for (const invByLink of nState.links.getMany('inv-by')) {
        this.addCacheDependency(resolve(invByLink), nState.uri);
      }
    }

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
   * Helper function for clearing the cache for a resource.
   *
   * This function will also emit the 'stale' event for resources that have
   * subscribers, and handle any dependent resource caches.
   *
   * If any resources are specified in deletedUris, those will not
   * receive 'stale' events, but 'delete' events instead.
   */
  clearResourceCache(staleUris: string[], deletedUris: string[]) {
    let stale = new Set<string>();
    const deleted = new Set<string>();
    for (const uri of staleUris) {
      stale.add(resolve(this.bookmarkUri, uri));
    }
    for (const uri of deletedUris) {
      stale.add(resolve(this.bookmarkUri, uri));
      deleted.add(resolve(this.bookmarkUri, uri));
    }

    stale = this.expandCacheDependencies(
      new Set([...stale, ...deleted]),
      this.cacheDependencies,
    );

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

  /**
   * Find all dependencies for a given resource.
   *
   * For example, if
   *   * if resourceA depends on resourceB
   *   * and resourceB depends on resourceC
   *
   * Then if 'resourceC' expires, so should 'resourceA' and 'resourceB'.
   *
   * This function helps us find these dependencies recursively and guarding
   * against recursive loops.
   */
  private expandCacheDependencies(
    uris: Set<string>,
    dependencies: Map<string, Set<string>>,
    output?: Set<string>,
  ): Set<string> {
    if (!output) output = new Set();

    for (const uri of uris) {
      if (!output.has(uri)) {
        output.add(uri);

        // Find resources that depend on this URI (forward dependencies)
        if (dependencies.has(uri)) {
          this.expandCacheDependencies(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            dependencies.get(uri)!,
            dependencies,
            output,
          );
        }

        // Find resources that this URI depends on (reverse dependencies)
        for (const [key, value] of dependencies.entries()) {
          if (value.has(uri) && !output.has(key)) {
            this.expandCacheDependencies(new Set([key]), dependencies, output);
          }
        }
      }
    }

    return output;
  }
}
