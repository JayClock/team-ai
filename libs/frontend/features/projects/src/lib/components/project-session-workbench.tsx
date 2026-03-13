import { ShellsSession, type ShellsSessionProps } from '@shells/session';

export type ProjectSessionWorkbenchProps = ShellsSessionProps;

export function ProjectSessionWorkbench(props: ProjectSessionWorkbenchProps) {
  return <ShellsSession {...props} />;
}
