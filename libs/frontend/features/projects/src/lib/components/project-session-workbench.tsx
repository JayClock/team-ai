import { State } from '@hateoas-ts/resource';
import { ShellsSession, type ShellsSessionProps } from '@shells/session';
import { ProjectRuntimeProfile } from '@shared/schema';
import { useEffect, useState } from 'react';

export type ProjectSessionWorkbenchProps = Omit<
  ShellsSessionProps,
  'runtimeProfile'
>;

type ProjectSessionRuntimeProfile = NonNullable<
  ShellsSessionProps['runtimeProfile']
>;

function toWorkbenchRuntimeProfile(
  profileState: State<ProjectRuntimeProfile>,
): ProjectSessionRuntimeProfile {
  return {
    defaultProviderId: profileState.data.defaultProviderId,
    orchestrationMode: profileState.data.orchestrationMode,
  };
}

export function ProjectSessionWorkbench(props: ProjectSessionWorkbenchProps) {
  const { projectState } = props;
  const [runtimeProfile, setRuntimeProfile] =
    useState<ProjectSessionRuntimeProfile | null>(null);

  useEffect(() => {
    let active = true;

    setRuntimeProfile(null);

    void projectState
      .follow('runtime-profile')
      .get()
      .then((profileState) => {
        if (!active) {
          return;
        }

        setRuntimeProfile(toWorkbenchRuntimeProfile(profileState));
      })
      .catch(() => {
        if (active) {
          setRuntimeProfile(null);
        }
      });

    return () => {
      active = false;
    };
  }, [projectState]);

  return <ShellsSession {...props} runtimeProfile={runtimeProfile} />;
}
