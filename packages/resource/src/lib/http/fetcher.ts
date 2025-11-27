import { injectable } from 'inversify';
import { fetch } from 'next/dist/compiled/@edge-runtime/primitives/index.js';

@injectable()
export class Fetcher {
  /**
   * A wrapper for MDN fetch()
   */
  fetch(resource: string | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(resource, init);
    return fetch(request);
  }
}
