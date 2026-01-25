import { State } from '@hateoas-ts/resource';
import { Project, User } from '@shared/schema';
import { UserProjects } from '@features/user-projects';
import { Cockpit } from '@shells/cockpit';
import { useState } from 'react';
interface Props {
  userState: State<User>;
}

export function Layout(props: Props) {
  const { userState } = props;
  const [projectState, setProjectState] = useState<State<Project>>();
  return (
    <div>
      <UserProjects
        state={userState}
        onProjectChange={setProjectState}
      ></UserProjects>
      <Cockpit projectState={projectState}></Cockpit>
    </div>
  );
}

export default Layout;
