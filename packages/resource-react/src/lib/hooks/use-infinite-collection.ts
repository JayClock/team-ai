import { Entity, ExtractCollectionElement, State } from '@hateoas-ts/resource';
import { ResourceLike } from './use-resolve-resource';
import { useEffect, useState } from 'react';
import { useReadResource } from './use-read-resource';

export function useInfiniteCollection<T extends Entity>(
  resourceLike: ResourceLike<T>,
) {
  const [items, setItems] = useState<State<ExtractCollectionElement<T>>[]>([]);
  const bc = useReadResource(resourceLike);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bc.loading) {
      setItems((prevItems) => {
        return prevItems.concat(bc.resourceState.collection);
      });
      setLoading(false);
    }
  }, [bc.loading, bc.resourceState]);

  return {
    items,
    loading,
  };
}
