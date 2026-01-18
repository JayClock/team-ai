import { State } from "@hateoas-ts/resource";
import { Project, Conversation } from "@shared/schema";

export interface Props {
  state?: State<Project>;
  onConversationChange: (conversationState: State<Conversation>) => void;
}
