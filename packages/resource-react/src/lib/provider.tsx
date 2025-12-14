import { Entity, Resource } from '@hateoas/resource';
import * as React from 'react';

type ResourceProviderProps = {
  resource: Resource<Entity>;
  children: React.ReactNode;
};

const ResourceContext = React.createContext<{
  resource?: Resource<Entity>;
}>({});

export const getResourceContext = () => {
  return ResourceContext;
};

export const ResourceProvider: React.FC<ResourceProviderProps> = ({
  resource,
  children,
}) => {
  const Context = getResourceContext();
  return (
    <Context.Provider value={{ resource: resource }}>
      {children}
    </Context.Provider>
  );
};
