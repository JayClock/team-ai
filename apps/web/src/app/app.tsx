import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NxWelcome from './nx-welcome';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NxWelcome />
    </QueryClientProvider>
  );
}
export default App;
