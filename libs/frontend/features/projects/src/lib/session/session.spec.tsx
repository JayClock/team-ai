import type { State } from '@hateoas-ts/resource';
import type { AcpSession, Codebase, Project } from '@shared/schema';
import { act, render, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellsSession } from './session';

const conversationPaneSpy = vi.fn();
const updateSessionMock = vi.fn();
const resourceGetMock = vi.fn(async () => ({
  collection: [],
  follow: vi.fn(),
  hasLink: vi.fn(() => false),
}));

const meResource = { id: 'me-resource' };
const codebasesResource = { id: 'codebases-resource' };
const codebasesState = {
  collection: [],
} as { collection: Array<State<Codebase>> };
const clientGoMock = vi.fn((path: string) => {
  if (path === '/api') {
    return {
      follow: vi.fn((rel: string) => {
        if (rel !== 'me') {
          throw new Error(`Unsupported rel: ${rel}`);
        }

        return meResource;
      }),
    };
  }

  return {
    get: resourceGetMock,
  };
});
const clientMock = {
  go: clientGoMock,
};

let currentSelectedSession: State<AcpSession> | null = null;

vi.mock('@hateoas-ts/resource-react', () => ({
  useClient: () => clientMock,
  useSuspenseResource: (resource: unknown) => {
    if (resource === meResource) {
      return {
        data: {
          id: 'user-1',
        },
      };
    }

    if (resource === codebasesResource) {
      return {
        resourceState: codebasesState,
      };
    }

    throw new Error('Unsupported suspense resource');
  },
}));

vi.mock('@features/project-conversations', () => ({
  useAcpSession: () => ({
    create: vi.fn(),
    prompt: vi.fn(),
    select: vi.fn(),
    updateSession: updateSessionMock,
    selectedSession: currentSelectedSession,
  }),
}));

vi.mock('@shared/ui', () => ({
  Button: (props: { children?: ReactNode }) =>
    createElement('button', null, props.children),
  ResizableHandle: () => createElement('div'),
  ResizablePanel: (props: { children?: ReactNode }) =>
    createElement('div', null, props.children),
  ResizablePanelGroup: (props: { children?: ReactNode }) =>
    createElement('div', null, props.children),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@shared/util-http', () => ({
  runtimeFetch: vi.fn(),
}));

vi.mock('./project-session-history-sidebar', () => ({
  ProjectSessionHistorySidebar: () =>
    createElement('div', { 'data-testid': 'session-history-sidebar' }),
}));

vi.mock('../components/project-runtime-profile-panel', () => ({
  ProjectRuntimeProfilePanel: () =>
    createElement('div', { 'data-testid': 'runtime-profile-panel' }),
}));

vi.mock('../components/project-settings-dialog', () => ({
  ProjectSettingsDialog: () =>
    createElement('div', { 'data-testid': 'project-settings-dialog' }),
}));

vi.mock('./project-session-conversation-pane', () => ({
  ProjectSessionConversationPane: (props: unknown) => {
    conversationPaneSpy(props);
    return createElement('div', { 'data-testid': 'conversation-pane' });
  },
}));

vi.mock('@features/session-events', () => ({
  SessionEvents: () => createElement('div', { 'data-testid': 'session-events' }),
  useAcpProviders: (defaultProviderId: string | null) => ({
    loading: false,
    providers: [
      {
        id: 'opencode',
        name: 'OpenCode',
      },
      {
        id: 'codex',
        name: 'Codex',
      },
    ],
    selectedProviderId: defaultProviderId ?? null,
    setSelectedProviderId: vi.fn(),
  }),
  useProjectSessionChat: () => ({
    handlePromptSubmit: vi.fn(),
    hasPendingAssistantMessage: false,
  }),
}));

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    matches: true,
    removeEventListener: vi.fn(),
  })),
});

describe('ShellsSession', () => {
  beforeEach(() => {
    currentSelectedSession = null;
    clientGoMock.mockClear();
    conversationPaneSpy.mockClear();
    resourceGetMock.mockClear();
    updateSessionMock.mockReset();
    updateSessionMock.mockResolvedValue(currentSelectedSession);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prefills provider and model overrides for an existing session', async () => {
    currentSelectedSession = createSessionState({
      id: 'session-1',
      model: 'gpt-5',
      provider: 'codex',
    });

    render(
      <ShellsSession
        projectState={createProjectState()}
        projectTitle="Team AI"
        runtimeProfile={{
          orchestrationMode: 'ROUTA',
          roleDefaults: {
            ROUTA: {
              model: 'gpt-5-mini',
              providerId: 'opencode',
            },
          },
        }}
      />,
    );

    await waitFor(() => {
      const props = readConversationPaneProps();
      expect(props.provider?.value).toBe('codex');
      expect(props.model?.value).toBe('gpt-5');
    });
  });

  it('updates the selected session model immediately when switching models', async () => {
    currentSelectedSession = createSessionState({
      id: 'session-1',
      model: 'gpt-5',
      provider: 'codex',
    });

    render(
      <ShellsSession
        projectState={createProjectState()}
        projectTitle="Team AI"
        runtimeProfile={{
          orchestrationMode: 'ROUTA',
          roleDefaults: {
            ROUTA: {
              model: 'gpt-5-mini',
              providerId: 'opencode',
            },
          },
        }}
      />,
    );

    act(() => {
      const props = readConversationPaneProps();
      props.model?.onValueChange?.('gpt-5.4');
    });

    await waitFor(() => {
      expect(updateSessionMock).toHaveBeenCalledWith({
        model: 'gpt-5.4',
        session: currentSelectedSession,
      });
    });
  });

  it('recreates the selected session when switching providers', async () => {
    currentSelectedSession = createSessionState({
      id: 'session-1',
      model: 'gpt-5',
      provider: 'codex',
    });

    render(
      <ShellsSession
        projectState={createProjectState()}
        projectTitle="Team AI"
        runtimeProfile={{
          orchestrationMode: 'ROUTA',
          roleDefaults: {
            ROUTA: {
              model: 'gpt-5-mini',
              providerId: 'opencode',
            },
          },
        }}
      />,
    );

    act(() => {
      const props = readConversationPaneProps();
      props.provider?.onValueChange?.('opencode');
    });

    await waitFor(() => {
      expect(updateSessionMock).toHaveBeenCalledWith({
        model: null,
        provider: 'opencode',
        session: currentSelectedSession,
      });
    });
  });
});

function createProjectState(): State<Project> {
  return {
    collection: [],
    data: {
      id: 'project-1',
      repoPath: '/tmp/project-1',
      sourceUrl: null,
      title: 'Project One',
    },
    follow: vi.fn((rel: string) => {
      if (rel !== 'codebases') {
        throw new Error(`Unsupported rel: ${rel}`);
      }

      return codebasesResource;
    }),
    hasLink: vi.fn((rel: string) => rel === 'codebases'),
  } as unknown as State<Project>;
}

function createSessionState(input: {
  id: string;
  model: string | null;
  provider: string;
}): State<AcpSession> {
  return {
    collection: [],
    data: {
      acpError: null,
      acpStatus: 'ready',
      actor: { id: 'user-1' },
      agent: { id: 'agent-1' },
      cancelRequestedAt: null,
      cancelledAt: null,
      codebase: null,
      completedAt: null,
      cwd: '/tmp/project-1',
      deadlineAt: null,
      failureReason: null,
      forceKilledAt: null,
      id: input.id,
      inactiveDeadlineAt: null,
      lastActivityAt: '2026-03-16T00:00:00.000Z',
      lastEventId: null,
      model: input.model,
      name: 'Session 1',
      parentSession: null,
      project: { id: 'project-1' },
      provider: input.provider,
      specialistId: 'solo-developer',
      state: 'RUNNING',
      startedAt: '2026-03-16T00:00:00.000Z',
      stepCount: 0,
      supervisionPolicy: {
        cancelGraceMs: 1000,
        completionGraceMs: 1000,
        inactivityTimeoutMs: 600000,
        maxRetries: 0,
        maxSteps: 64,
        packageManagerInitTimeoutMs: 120000,
        promptTimeoutMs: 300000,
        providerInitTimeoutMs: 10000,
        totalTimeoutMs: 1800000,
      },
      timeoutScope: null,
      worktree: null,
    },
    follow: vi.fn(),
    hasLink: vi.fn(() => false),
  } as unknown as State<AcpSession>;
}

function readConversationPaneProps(): {
  model?: {
    onValueChange?: (value: string | null) => void;
    value?: string | null;
  };
  project?: {
    onValueChange?: (value: unknown) => void;
  };
  provider?: {
    onValueChange?: (value: string | null) => void;
    value?: string | null;
  };
} {
  const props = conversationPaneSpy.mock.lastCall?.[0];

  expect(props).toBeDefined();

  return props as {
    model?: {
      onValueChange?: (value: string | null) => void;
      value?: string | null;
    };
    project?: {
      onValueChange?: (value: unknown) => void;
    };
    provider?: {
      onValueChange?: (value: string | null) => void;
      value?: string | null;
    };
  };
}
