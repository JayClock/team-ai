'use client';
import { Chat } from '@web/features';
import { container, Users } from '@web/persistent';
import { useQuery } from '@tanstack/react-query';

const users = container.get(Users);

export default function Index() {
  const { data, isPending } = useQuery({
    queryKey: ['key'],
    queryFn: () => users.findById('1'),
  });
  if (isPending) {
    return 'loading';
  }
  if (!data) {
    return <div>No user data available</div>;
  }
  return <Chat user={data} />;
}
