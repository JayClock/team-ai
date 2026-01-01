import { Entity, ExtractCollectionElement, State } from '@hateoas-ts/resource';
import { ResourceLike } from './use-resolve-resource';
import { useEffect, useState } from 'react';
import { useReadResource } from './use-read-resource';

export function useInfiniteCollection<T extends Entity>(
  resourceLike: ResourceLike<T>,
) {
  const [items, setItems] = useState<State<ExtractCollectionElement<T>>[]>([]);
  const { loading, resourceState } = useReadResource(resourceLike);

  useEffect(() => {
    if (!loading && resourceState?.collection) {
      setItems((prevItems) => {
        return prevItems.concat(resourceState.collection);
      });
    }
  }, [loading, resourceLike, resourceState?.collection]);
  return {
    items,
    loading,
  };
}
