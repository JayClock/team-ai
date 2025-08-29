import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NxWelcome from './nx-welcome';
import { XProvider } from '@ant-design/x';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <XProvider>
        <NxWelcome />
      </XProvider>
    </QueryClientProvider>
  );
}
export default App;
