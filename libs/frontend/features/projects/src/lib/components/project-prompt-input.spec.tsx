import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectPromptInput } from './project-prompt-input';

describe('ProjectPromptInput', () => {
  it('renders the repository picker when configured', () => {
    render(
      <ProjectPromptInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
        projectPicker={{
          onProjectSelect: () => undefined,
          projects: [
            {
              id: 'project-1',
              repoPath: '/tmp/project-1',
              sourceUrl: 'https://github.com/acme/project-1',
              title: 'Project One',
            },
          ],
          selectedProjectId: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择或 clone 仓库' }));

    expect(screen.getByText('已有仓库')).toBeTruthy();
    expect(screen.getByText('Clone 仓库')).toBeTruthy();
    expect(screen.getByText('Project One')).toBeTruthy();
  });
});
