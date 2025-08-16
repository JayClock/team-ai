import { Container, Factory } from 'inversify';
import { UserConversations, Users } from './lib/associations/index.js';
import { UserLinks } from './lib/responses/user-response.js';

export const container = new Container();
container.bind(Users).toSelf().inSingletonScope();
container
  .bind<Factory<UserConversations>>('Factory<UserConversations>')
  .toFactory(() => {
    return (links: UserLinks) => {
      return new UserConversations(links);
    };
  });
