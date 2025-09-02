import 'reflect-metadata';

import { Container, Factory } from 'inversify';
import {
  ConversationMessages,
  UserConversations,
  Users,
} from './associations/index.js';
import { axiosInstance } from './axios-instance.js';
import { Axios } from 'axios';
import { HalLinks } from './archtype/hal-links.js';
import { Contexts } from './associations/contexts.js';
import { ENTRANCES } from '@web/domain';

export const container = new Container();

container.bind(Axios).toConstantValue(axiosInstance);
container.bind(ENTRANCES.USERS).to(Users).inSingletonScope();
container.bind(ENTRANCES.CONTEXTS).to(Contexts).inSingletonScope();
container
  .bind<Factory<UserConversations>>('Factory<UserConversations>')
  .toFactory((context) => {
    return (links: HalLinks) => {
      return new UserConversations(
        links,
        context.get(Axios),
        context.get('Factory<ConversationMessages>')
      );
    };
  });
container
  .bind<Factory<ConversationMessages>>('Factory<ConversationMessages>')
  .toFactory((context) => {
    return (links: HalLinks) => {
      return new ConversationMessages(links, context.get(Axios));
    };
  });
