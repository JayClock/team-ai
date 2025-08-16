import { Container, Factory } from 'inversify';
import { UserConversations, Users } from './associations/index.js';
import { UserLinks } from './responses/user-response.js';
import { axiosInstance } from './axios-instance.js';
import { Axios } from 'axios';

export const container = new Container();

container.bind(Axios).toConstantValue(axiosInstance);
container.bind(Users).toSelf().inSingletonScope();
container
  .bind<Factory<UserConversations>>('Factory<UserConversations>')
  .toFactory((context) => {
    return (links: UserLinks) => {
      return new UserConversations(links, context.get(Axios));
    };
  });
