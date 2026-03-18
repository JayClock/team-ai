import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectComposerInput } from './project-composer-input';

const runtimeFetchMock = vi.fn();

type ComposerEditor = {
  commands: {
    insertContent: (value: string) => boolean;
    setContent: (value: string) => boolean;
  };
};

type ComposerTextbox = HTMLElement & {
  __projectComposerEditor?: ComposerEditor;
};

vi.mock('@shared/util-http', () => ({
  runtimeFetch: (...args: unknown[]) => runtimeFetchMock(...args),
}));

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
const elementPrototype = (
  globalThis as {
    Element?: {
      prototype: {
        getBoundingClientRect?: () => DOMRect;
        getClientRects?: () => DOMRect[];
      };
    };
  }
).Element?.prototype;
const rangePrototype = (
  globalThis as {
    Range?: {
      prototype: {
        getBoundingClientRect?: () => DOMRect;
        getClientRects?: () => DOMRect[];
      };
    };
  }
).Range?.prototype;

if (htmlElementPrototype) {
  Object.defineProperty(htmlElementPrototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
}

if (elementPrototype && !elementPrototype.getClientRects) {
  Object.defineProperty(elementPrototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
}

if (elementPrototype && !elementPrototype.getBoundingClientRect) {
  Object.defineProperty(elementPrototype, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

if (rangePrototype && !rangePrototype.getClientRects) {
  Object.defineProperty(rangePrototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
}

if (rangePrototype && !rangePrototype.getBoundingClientRect) {
  Object.defineProperty(rangePrototype, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

async function getComposerEditor() {
  const textbox = screen.getByRole('textbox', {
    name: '项目指令输入框',
  }) as ComposerTextbox;

  await waitFor(() => expect(textbox.__projectComposerEditor).toBeTruthy());

  return textbox.__projectComposerEditor as ComposerEditor;
}

async function setComposerText(value: string) {
  const editor = await getComposerEditor();

  editor.commands.setContent(value);

  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: '项目指令输入框' }).textContent,
    ).toContain(value),
  );
}

async function appendComposerText(value: string) {
  const editor = await getComposerEditor();

  editor.commands.insertContent(value);

  await waitFor(() =>
    expect(
      screen.getByRole('textbox', { name: '项目指令输入框' }).textContent,
    ).toContain(value),
  );
}

async function openComposerCommands() {
  const editor = await getComposerEditor();

  editor.commands.insertContent('/');

  return await screen.findByRole('button', {
    name: /添加附件/,
  });
}

describe('ProjectComposerInput', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    runtimeFetchMock.mockReset();
    runtimeFetchMock.mockResolvedValue({
      json: async () => ({ files: [] }),
      ok: true,
    });
  });

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

    await setComposerText('实现 provider 选择');
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

    await setComposerText('实现 model 选择');
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

    await setComposerText('实现 repo context 选择');
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

  it('selects repository files and includes them in the submit payload', async () => {
    const onSubmit = vi.fn();

    runtimeFetchMock.mockResolvedValue({
      json: async () => ({
        files: [
          {
            fullPath: '/tmp/project-1/src/lib/project-composer-input.tsx',
            name: 'project-composer-input.tsx',
            path: 'src/lib/project-composer-input.tsx',
            score: 900,
          },
        ],
      }),
      ok: true,
    });

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

    expect(await openComposerCommands()).toBeTruthy();

    fireEvent.mouseDown(
      await screen.findByRole('button', { name: /选择仓库文件/ }),
    );

    const dialog = await screen.findByRole('dialog');

    await waitFor(() =>
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/files/search?limit=20&repoPath=%2Ftmp%2Fproject-1',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      ),
    );

    fireEvent.click(
      within(dialog).getByRole('option', {
        name: 'project-composer-input.tsx src/lib/project-composer-input.tsx',
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: '项目指令输入框' }).textContent,
      ).toContain('@project-composer-input.tsx'),
    );

    await appendComposerText('请分析输入组件');
    fireEvent.click(screen.getByRole('button', { name: '发起会话' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        cwd: '/tmp/project-1',
        files: [
          expect.objectContaining({
            fullPath: '/tmp/project-1/src/lib/project-composer-input.tsx',
            kind: 'repo-file',
            name: 'project-composer-input.tsx',
            path: 'src/lib/project-composer-input.tsx',
          }),
        ],
        model: undefined,
        provider: undefined,
        text:
          '请分析输入组件\n\n已选择的项目文件上下文：\n- src/lib/project-composer-input.tsx',
      }),
    );
  });

  it('encodes repository paths with spaces when searching files', async () => {
    runtimeFetchMock.mockResolvedValue({
      json: async () => ({
        files: [],
      }),
      ok: true,
    });

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
              repoPath: '/tmp/project space',
              sourceUrl: 'https://github.com/acme/project-1',
              title: 'Project One',
            },
          ],
          value: {
            id: 'project-1',
            repoPath: '/tmp/project space',
            sourceUrl: 'https://github.com/acme/project-1',
            title: 'Project One',
          },
        }}
      />,
    );

    expect(await openComposerCommands()).toBeTruthy();

    fireEvent.mouseDown(
      await screen.findByRole('button', { name: /选择仓库文件/ }),
    );

    await waitFor(() =>
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/files/search?limit=20&repoPath=%2Ftmp%2Fproject%20space',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it('invokes provider switching from slash commands', async () => {
    const onProviderChange = vi.fn();

    render(
      <ProjectComposerInput
        ariaLabel="项目指令输入框"
        onSubmit={() => undefined}
        placeholder="输入内容"
        provider={{
          onValueChange: onProviderChange,
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
          value: undefined,
        }}
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

    expect(await openComposerCommands()).toBeTruthy();

    const providerCommand = await screen.findByRole('button', {
      name: /切换 Provider: OpenCode/,
    });

    fireEvent.mouseDown(providerCommand);

    expect(onProviderChange).toHaveBeenCalledWith('opencode');
  });
});
