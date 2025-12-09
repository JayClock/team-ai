import { ForeverCache } from './forever-cache.js';
import { State } from '../state/state.js';

/**
 * ShortCache stores items in the cache for a short time.
 *
 * The reason in this scenarios it's useful to still have a 'very temporary'
 * cache, is because during many operations `get()` may be called in rapid
 * succession, and it also allows for enough time for 'embedded items' to
 * pe placed in the cache and extracted again.
 */
export class ShortCache extends ForeverCache {
  private readonly cacheTimeout: number;
  private activeTimers: Map<string, ReturnType<typeof setInterval>>;

  /**
   * Create the short cache.
   *
   * cacheTimeout is specified in ms.
   */
  constructor(cacheTimeout = 30000) {
    super();
    this.cacheTimeout = cacheTimeout;
    this.activeTimers = new Map();
  }

  /**
   * Store a State object.
   *
   * This function will clone the state object before storing
   */
  override store(state: State) {
    super.store(state);
    this.setTimer(state.uri);
  }

  private setTimer(uri: string) {
    if (this.activeTimers.has(uri)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      clearTimeout(this.activeTimers.get(uri)!);
    }
    // If there is a TON in the cache, this algorithm might
    // be optimized by using a linked list and a single timeout
    // for the 'next scheduled' expiry.
    //
    // The expectation is that this is not the case though, so this is the
    // lazy/easy way.
    this.activeTimers.set(
      uri,
      setTimeout(() => {
        this.delete(uri);
        this.activeTimers.delete(uri);
      }, this.cacheTimeout)
    );
  }

  /**
   * Clean up any dangling references to avoid memory leaks.
   */
  override destroy() {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
  }
}
