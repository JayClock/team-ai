import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { ResourceProvider } from '@hateoas-ts/resource-react';
import { Toaster } from '@shared/ui';

async function bootstrap() {
  const [{ default: App }, apiClientModule] = await Promise.all([
    import('./app/app'),
    import('./lib/api-client'),
  ]);

  await apiClientModule.initializeApiClient();

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
  );

  root.render(
    <StrictMode>
      <ResourceProvider client={apiClientModule.apiClient}>
        <App />
        <Toaster position="top-center" />
      </ResourceProvider>
    </StrictMode>,
  );
}

void bootstrap();
