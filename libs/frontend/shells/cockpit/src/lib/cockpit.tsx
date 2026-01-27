import { State } from '@hateoas-ts/resource';
import { Conversation, Project } from '@shared/schema';
import { ProjectConversations } from '@features/project-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';

interface OutletContext {
  projectState?: State<Project>;
}

export function Cockpit() {
  const { projectState } = useOutletContext<OutletContext>();
  const [conversationState, setConversationState] =
    useState<State<Conversation>>();

  return (
    <div className="h-full">
      <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="hidden h-full border-r md:block overflow-hidden">
          <ProjectConversations
            state={projectState}
            onConversationChange={setConversationState}
          />
        </aside>
        <main className="flex flex-col overflow-hidden">
          <ConversationMessages conversationState={conversationState} />
        </main>
      </div>
    </div>
  );
}

export default Cockpit;
