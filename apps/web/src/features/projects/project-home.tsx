import ShellsSessions from '@shells/sessions';
import { ProjectPromptInput } from './project-prompt-input';

export default function ProjectHome() {
  return (
    <ShellsSessions
      renderPromptInput={(props) => (
        <ProjectPromptInput {...props} variant="home" />
      )}
    />
  );
}
