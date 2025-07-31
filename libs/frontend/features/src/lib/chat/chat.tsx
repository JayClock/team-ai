import { User } from '@web/domain';

export function Chat(props: { user: User }) {
  return <div>Chat {props.user.getDescription().name}</div>;
}
