import { Props } from './interface';
import ConversationList from './components/conversation-list/conversation-list';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@shared/ui/components/empty';
import { SidebarProvider } from '@shared/ui';

export function ProjectConversations(props: Props) {
  const { state, ...rest } = props;
  if (!state?.value) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
            </EmptyMedia>
            <EmptyTitle>No project selected</EmptyTitle>
            <EmptyDescription>
              Select a project to view its conversations
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  return (
    <div className="p-4 h-full overflow-hidden">
      <SidebarProvider className="h-full">
        <ConversationList state={state} {...rest} />
      </SidebarProvider>
    </div>
  );
}

export default ProjectConversations;
