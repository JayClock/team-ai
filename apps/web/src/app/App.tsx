import { Chat, EpicBreakdown } from '@web/features';
import AppLayout from './AppLayout';
import { Route, Routes } from 'react-router-dom';
import { container } from '@web/persistent';
import { ENTRANCES, UserLegacy, UsersLegacy } from '@web/domain';
import { effect, signal } from '@preact/signals-react';
import { finalize, from, tap } from 'rxjs';

const users: UsersLegacy = container.get(ENTRANCES.USERS);

const user = signal<UserLegacy>();
const isLoading = signal(false);

effect(() => {
  isLoading.value = true;
  const subscription = from(users.findById('1'))
    .pipe(
      tap((res) => (user.value = res)),
      finalize(() => (isLoading.value = false))
    )
    .subscribe();
  return () => subscription.unsubscribe();
});

export default function App() {
  if (!user.value) {
    return <div>No user data available</div>;
  }
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Chat user={user.value} />}></Route>
        <Route
          path="/epic-breakdown"
          element={<EpicBreakdown user={user.value} />}
        ></Route>
      </Routes>
    </AppLayout>
  );
}
