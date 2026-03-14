import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectComposerInput } from './project-composer-input';

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

describe('ProjectComposerInput', () => {
  it('renders the repository picker when configured', () => {
    render(
      <ProjectComposerInput
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
      <ProjectComposerInput
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
  });

  it('submits the selected provider with the prompt payload', async () => {
    const onSubmit = vi.fn();

    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={onSubmit}
        placeholder="输入内容"
        providerPicker={{
          onValueChange: () => undefined,
          providers: [
            {
              command: 'npx opencode',
              description: 'OpenCode provider',
              distributionTypes: ['npx'],
              envCommandKey: 'OPENCODE_COMMAND',
              id: 'opencode',
              installable: true,
              installed: true,
              name: 'OpenCode',
              source: 'static',
              status: 'available',
              unavailableReason: null,
            },
          ],
          value: 'opencode',
        }}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '项目指令输入框' }), {
      target: { value: '实现 provider 选择' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发起会话' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        files: [],
        provider: 'opencode',
        text: '实现 provider 选择',
      }),
    );
  });
});
