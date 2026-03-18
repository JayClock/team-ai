import { Collection, Entity } from '@hateoas-ts/resource';

export type Flow = Entity<
  {
    id: string;
    name: string;
    description: string | null;
    version: string | null;
    trigger: {
      event: string | null;
      source: string | null;
      type: 'manual' | 'schedule' | 'webhook';
    };
    variables: Record<string, string>;
    steps: Array<{
      adapter: string | null;
      config: Record<string, string>;
      input: string;
      name: string;
      outputKey: string | null;
      specialistId: string;
    }>;
    source: {
      libraryId: string | null;
      path: string;
      scope: 'builtin' | 'library' | 'user' | 'workspace';
    };
  },
  {
    self: Flow;
    collection: FlowCollection;
  }
>;

export type FlowCollection = Entity<
  Collection<Flow>['data'],
  Collection<Flow>['links']
>;
