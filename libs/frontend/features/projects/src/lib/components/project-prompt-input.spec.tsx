import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectPromptInput } from './project-prompt-input';

class ResizeObserverMock {
  disconnect() {
    return undefined;
  }

  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverMock,
});

const htmlElementPrototype = (
  globalThis as {
    HTMLElement?: { prototype: { scrollIntoView?: () => void } };
  }
).HTMLElement?.prototype;

if (htmlElementPrototype) {
  Object.defineProperty(htmlElementPrototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
}

describe('ProjectPromptInput', () => {
  it('renders the repository picker when configured', () => {
    render(
      <ProjectPromptInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
        projectPicker={{
          onValueChange: () => undefined,
          projects: [
            {
              id: 'project-1',
              repoPath: '/tmp/project-1',
              sourceUrl: 'https://github.com/acme/project-1',
              title: 'Project One',
            },
          ],
          value: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择或 clone 仓库' }));

    expect(screen.getByText('已有仓库')).toBeTruthy();
    expect(screen.getByText('Clone 仓库')).toBeTruthy();
    expect(screen.getByText('Project One')).toBeTruthy();
  });

  it('renders the selected repository pill inline', () => {
    render(
      <ProjectPromptInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
        projectPicker={{
          onValueChange: () => undefined,
          projects: [
            {
              id: 'project-1',
              repoPath: '/tmp/project-1',
              sourceUrl: 'https://github.com/acme/project-1',
              title: 'Project One',
            },
          ],
          value: {
            id: 'project-1',
            repoPath: '/tmp/project-1',
            sourceUrl: 'https://github.com/acme/project-1',
            title: 'Project One',
          },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Project One' })).toBeTruthy();
    expect(screen.getByText('/tmp/project-1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '清空仓库选择' })).toBeTruthy();
  });
});
