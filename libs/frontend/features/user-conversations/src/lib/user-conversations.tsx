import styles from './user-conversations.module.css';
import { User } from '@shared/schema';
import { Resource } from '@hateoas-ts/resource';

interface Props {
  resource: Resource<User>;
}

export function UserConversations(props: Props) {
  return (
    <div className={styles['container']}>
      <h1>Welcome to UserConversations!</h1>
    </div>
  );
}

export default UserConversations;
