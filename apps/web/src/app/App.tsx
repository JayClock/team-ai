import { createClient } from '@hateoas-ts/resource';
import { User } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';

const client = createClient({ baseURL: 'http://localhost:4200' });
const resource = client.go<User>('/api/users/1');

export default function App() {
  return <UserConversations resource={resource}></UserConversations>;
}
