// eslint-disable-next-line @nx/enforce-module-boundaries -- compatibility bridge to preserve the shell entrypoint while the implementation lives in @features/projects
export {
  default,
  ShellsSession,
  type ShellsSessionProps,
} from '../../../../features/projects/src/lib/session/session';
