import { State } from '@hateoas-ts/resource';
import { Project, Root } from '@shared/schema';
import { UserProjects } from '@features/user-projects';
import { Outlet } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';

export function Layout() {
  const client = useClient();
  const resource = useMemo(
    () => client.go<Root>('/api').follow('me'),
    [client],
  );
  const { resourceState: userState } = useSuspenseResource(resource);
  const [projectState, setProjectState] = useState<State<Project>>();
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 md:px-6">
          <div className="flex items-center gap-2">
            <svg
              className="h-6 w-6"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="hidden font-semibold sm:inline-block">
              Team AI
            </span>
          </div>
          <div className="ml-auto">
            <UserProjects state={userState} onProjectChange={setProjectState} />
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet context={{ projectState }} />
      </main>
    </div>
  );
}

export default Layout;
