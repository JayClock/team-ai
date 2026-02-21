import { State } from '@hateoas-ts/resource';
import { Conversation, Project } from '@shared/schema';
import { ProjectConversations } from '@features/project-conversations';
import { ConversationMessages } from '@features/conversation-messages';
import { type Signal, useSignal } from '@preact/signals-react';

interface Props {
  state?: Signal<State<Project>>;
}

export function Cockpit(props: Props) {
  const { state: projectStateSignal } = props;
  const conversationStateSignal = useSignal<State<Conversation> | undefined>(
    undefined,
  );

  return (
    <div className="h-full">
      <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="hidden h-full border-r md:block overflow-hidden">
          <ProjectConversations
            state={projectStateSignal}
            onConversationChange={(conversationState) => {
              conversationStateSignal.value = conversationState;
            }}
          />
        </aside>
        <main className="flex flex-col overflow-hidden">
          <ConversationMessages conversationState={conversationStateSignal} />
        </main>
      </div>
    </div>
  );
}

export default Cockpit;
