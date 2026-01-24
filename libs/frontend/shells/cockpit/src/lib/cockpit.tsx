import { State } from '@hateoas-ts/resource';
import { Conversation, Project } from '@shared/schema';
import { ProjectConversations } from '@features/project-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { useState } from 'react';

interface Props {
  projectState: State<Project>;
}

export function Cockpit(props: Props) {
  const { projectState } = props;
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();
  return (
    <div>
      <ProjectConversations
        state={projectState}
        onConversationChange={setConversationState}
      ></ProjectConversations>
      <ConversationMessages
        conversationState={conversationState}
      ></ConversationMessages>
    </div>
  );
}

export default Cockpit;
