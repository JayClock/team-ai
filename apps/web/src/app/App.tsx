import { Client } from 'resource';

type UserSchema = {
  description: { name: string };
  relations: { self: UserSchema };
};

const client = new Client({ baseURL: 'http://localhost:4200' });
const state = await client.go<UserSchema>('/api/users/1').get();

export default function App() {
  return <div></div>;
}
