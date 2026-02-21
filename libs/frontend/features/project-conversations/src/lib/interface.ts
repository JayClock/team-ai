import { State } from '@hateoas-ts/resource';
import { Project, Conversation } from '@shared/schema';
import { type Signal } from '@preact/signals-react';

export interface Props {
  state?: Signal<State<Project>>;
  onConversationChange: (conversationState: State<Conversation>) => void;
}
