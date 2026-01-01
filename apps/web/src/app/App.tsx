import { createClient } from '@hateoas-ts/resource';
import { User } from '@shared/schema';
import { UserConversations } from '@features/user-conversations';
import { XProvider } from '@ant-design/x';
import { ResourceProvider } from '@hateoas-ts/resource-react';

const client = createClient({ baseURL: 'http://localhost:4200' });
const resource = client.go<User>('/api/users/1');

export default function App() {
  return (
    <XProvider>
      <ResourceProvider client={client}>
        <UserConversations resource={resource}></UserConversations>
      </ResourceProvider>
    </XProvider>
  );
}
