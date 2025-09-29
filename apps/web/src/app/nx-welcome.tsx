import { useQuery } from '@tanstack/react-query';
import { Chat } from '@web/features';
import { container, UsersLegacy } from '@web/persistent';

const users = container.get(UsersLegacy);

export default function NxWelcome() {
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
