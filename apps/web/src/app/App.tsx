import { Chat, EpicBreakdown } from '@web/features';
import AppLayout from './AppLayout';
import { Route, Routes } from 'react-router-dom';
import { container } from '@web/persistent';
import { useQuery } from '@tanstack/react-query';
import { ENTRANCES, Users } from '@web/domain';

const users: Users = container.get(ENTRANCES.USERS);

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
        <Route path="/epic-breakdown" element={<EpicBreakdown />}></Route>
      </Routes>
    </AppLayout>
  );
}
