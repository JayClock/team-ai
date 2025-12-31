import { User } from '../schema';
import { createClient } from '@hateoas-ts/resource';

const client = createClient({ baseURL: 'http://localhost:4200' });
const state = await client.go<User>('/api/users/1').follow('self').request();
console.log(state);

export default function App() {
  return <div>123</div>;
}
