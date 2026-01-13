export { useClient } from './lib/hooks/use-client';
export { ResourceProvider } from './lib/provider';
export type { ResourceLike } from './lib/hooks/use-resolve-resource';
export { useInfiniteCollection } from './lib/hooks/use-infinite-collection';
export type { State } from '@hateoas-ts/resource';
export { useResource } from './lib/hooks/use-resource';

// Suspense hooks (React 19+)
export { useSuspenseResource } from './lib/hooks/use-suspense-resource';
export type { UseSuspenseResourceResponse } from './lib/hooks/use-suspense-resource';
export { useSuspenseInfiniteCollection } from './lib/hooks/use-suspense-infinite-collection';
export type { UseSuspenseInfiniteCollectionResponse } from './lib/hooks/use-suspense-infinite-collection';
