import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectComposerInput } from './project-composer-input';

vi.mock('../session/use-acp-provider-models', () => ({
  useAcpProviderModels: (providerId: string | null) => ({
    error: null,
    loading: false,
    models:
      providerId === 'opencode'
        ? [
            {
              id: 'gpt-5.4',
              name: 'GPT 5.4',
              providerId: 'opencode',
            },
          ]
        : [],
    providerId,
  }),
}));

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
  it('always renders the model picker', () => {
    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
      />,
    );

    const button = screen.getByRole('button', { name: '先选择 provider' });

    expect(button).toBeTruthy();
  });

  it('keeps the provider picker enabled when rendered', () => {
    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
      />,
    );

    const button = screen.getByRole('button', { name: '选择 provider' });

    expect(button).toBeTruthy();
  });

  it('renders the repository picker when configured', () => {
    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
        project={{
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
        project={{
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

  it('renders worktree management actions when worktrees are provided', () => {
    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
        project={{
          onCreateWorktree: () => undefined,
          onDeleteWorktree: () => undefined,
          onValidateWorktree: () => undefined,
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
          worktrees: [
            {
              id: 'wt_123',
              codebaseId: 'project-1',
              branch: 'wt/feature',
              baseBranch: 'main',
              status: 'active',
              worktreePath: '/tmp/worktrees/project-1',
              sessionId: null,
              label: 'Feature worktree',
              errorMessage: null,
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Project One' }));

    expect(screen.getByText('Feature worktree')).toBeTruthy();
    expect(screen.getByRole('button', { name: '校验' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删分支' })).toBeTruthy();
  });

  it('submits the selected provider with the prompt payload', async () => {
    const onSubmit = vi.fn();

    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        provider={{
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
        onSubmit={onSubmit}
        placeholder="输入内容"
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: '项目指令输入框' }), {
      target: { value: '实现 provider 选择' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发起会话' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        cwd: undefined,
        files: [],
        provider: 'opencode',
        text: '实现 provider 选择',
      }),
    );
  });

  it('submits the selected model with the prompt payload', async () => {
    const onSubmit = vi.fn();

    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        model={{
          onValueChange: () => undefined,
          value: 'gpt-5.4',
        }}
        onSubmit={onSubmit}
        placeholder="输入内容"
        provider={{
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
      target: { value: '实现 model 选择' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发起会话' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        cwd: undefined,
        files: [],
        model: 'gpt-5.4',
        provider: 'opencode',
        text: '实现 model 选择',
      }),
    );
  });

  it('submits the selected repository path as cwd', async () => {
    const onSubmit = vi.fn();

    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={onSubmit}
        placeholder="输入内容"
        project={{
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

    fireEvent.change(screen.getByRole('textbox', { name: '项目指令输入框' }), {
      target: { value: '实现 repo context 选择' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发起会话' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        cwd: '/tmp/project-1',
        files: [],
        provider: undefined,
        text: '实现 repo context 选择',
      }),
    );
  });
});
