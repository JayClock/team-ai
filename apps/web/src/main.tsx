import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { ResourceProvider } from '@hateoas-ts/resource-react';
import { apiClient } from './lib/api-client';
import { Toaster } from '@shared/ui';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <ResourceProvider client={apiClient}>
      <App />
      <Toaster position="top-center" />
    </ResourceProvider>
  </StrictMode>,
);
