import { Client } from '@hateoas-ts/resource';
import * as React from 'react';

type Props = {
  client: Client;
  children: React.ReactNode;
};

export const ClientContext = React.createContext<{
  client?: Client;
}>({});

export const ResourceProvider: React.FC<Props> = ({ client, children }) => {
  return (
    <ClientContext.Provider value={{ client }}>
      {children}
    </ClientContext.Provider>
  );
};
