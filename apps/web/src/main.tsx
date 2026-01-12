import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ResourceProvider } from '@hateoas-ts/resource-react';
import { apiClient } from './lib/api-client';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <ResourceProvider client={apiClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ResourceProvider>
  </StrictMode>,
);
