import { Chat } from '@web/features';
import AppLayout from './AppLayout';
import { Route, Routes } from 'react-router-dom';
import { container, Users } from '@web/persistent';
import { useQuery } from '@tanstack/react-query';

const users = container.get(Users);

export default function App() {
  const { data: user, isPending } = useQuery({
    queryKey: ['key'],
    queryFn: () => users.findById('1'),
  });
  if (isPending) {
    return 'loading';
  }
  if (!user) {
    return <div>No user data available</div>;
  }
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Chat user={user} />}></Route>
      </Routes>
    </AppLayout>
  );
}
