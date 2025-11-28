import { createClient, Entity } from 'resource';

type UserSchema = Entity<{ name: string }, { self: UserSchema }>;
const client = createClient({ baseURL: 'http://localhost:4200' });
const state = await client
  .go<UserSchema>('/api/users/1')
  .follow('self')
  .request();
console.log(state);

export default function App() {
  return <div>123</div>;
}
