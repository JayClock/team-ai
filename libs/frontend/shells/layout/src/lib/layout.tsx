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
    <div>
      <UserProjects
        state={userState}
        onProjectChange={setProjectState}
      ></UserProjects>
      <main>
        <Outlet context={{ projectState }}></Outlet>
      </main>
    </div>
  );
}

export default Layout;
