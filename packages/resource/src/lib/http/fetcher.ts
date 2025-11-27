import { inject, injectable } from 'inversify';
import { TYPES } from '../archtype/injection-types.js';

import type { Config } from '../archtype/config.js';

@injectable()
export class Fetcher {
  constructor(
    @inject(TYPES.Config)
    private readonly config: Config
  ) {}

  fetch(
    input: string | URL | globalThis.Request,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(`${this.config.baseURL}${input}`, init);
  }
}
