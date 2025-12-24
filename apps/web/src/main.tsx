import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { XProvider } from '@ant-design/x';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeConfig } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

const queryClient = new QueryClient();

const themeConfig: ThemeConfig = {};

root.render(
  <StrictMode>
    <XProvider theme={themeConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </XProvider>
  </StrictMode>,
);
