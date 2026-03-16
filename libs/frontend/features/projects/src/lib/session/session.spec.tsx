import type { State } from '@hateoas-ts/resource';
import type { AcpSession, Project } from '@shared/schema';
import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellsSession } from './session';

const conversationPaneSpy = vi.fn();
const sessionsRefreshMock = vi.fn();
const resourceGetMock = vi.fn(async () => ({
  collection: [],
  follow: vi.fn(),
  hasLink: vi.fn(() => false),
}));

const meResource = { id: 'me-resource' };
const codebasesResource = { id: 'codebases-resource' };
const codebasesState = {
  collection: [],
} as { collection: Array<State<unknown>> };
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
    history: [],
    ingestEvents: vi.fn(),
    prompt: vi.fn(),
    select: vi.fn(),
    selectedSession: currentSelectedSession,
    sessionsResource: {
      refresh: sessionsRefreshMock,
    },
  }),
}));

vi.mock('@shared/ui', () => ({
  Button: (props: { children?: unknown }) => createElement('button', null, props.children),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@shared/util-http', () => ({
  getCurrentDesktopRuntimeConfig: () => null,
  resolveRuntimeApiUrl: () => 'http://localhost/api/acp',
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

vi.mock('./project-session-conversation-pane', () => ({
  ProjectSessionConversationPane: (props: unknown) => {
    conversationPaneSpy(props);
    return createElement('div', { 'data-testid': 'conversation-pane' });
  },
}));

vi.mock('./project-session-spec-pane', () => ({
  ProjectSessionSpecPane: () =>
    createElement('div', { 'data-testid': 'spec-pane' }),
}));

vi.mock('./project-session-status-sidebar', () => ({
  ProjectSessionStatusSidebar: () =>
    createElement('div', { 'data-testid': 'status-sidebar' }),
}));

vi.mock('./use-project-session-chat', () => ({
  useProjectSessionChat: () => ({
    chatMessages: [],
    handlePromptSubmit: vi.fn(),
    hasPendingAssistantMessage: false,
  }),
}));

vi.mock('./use-acp-provider-models', () => ({
  useAcpProviderModels: (providerId: string | null) => ({
    error: null,
    loading: false,
    models:
      providerId === 'codex'
        ? [
            {
              id: 'gpt-5',
              name: 'GPT 5',
              providerId: 'codex',
            },
          ]
        : [
            {
              id: 'gpt-5-mini',
              name: 'GPT 5 Mini',
              providerId: 'opencode',
            },
            {
              id: 'gpt-5.4',
              name: 'GPT 5.4',
              providerId: 'opencode',
            },
          ],
  }),
}));

vi.mock('./use-acp-providers', async () => {
  const React = await import('react');

  return {
    useAcpProviders: (defaultProviderId: string | null) => {
      const [selectedProviderId, setSelectedProviderId] = React.useState(
        defaultProviderId ?? null,
      );

      return {
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
        selectedProviderId,
        setSelectedProviderId,
      };
    },
  };
});

class EventSourceMock {
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  addEventListener() {
    return undefined;
  }

  close() {
    return undefined;
  }
}

Object.defineProperty(globalThis, 'EventSource', {
  configurable: true,
  value: EventSourceMock,
});

describe('ShellsSession', () => {
  beforeEach(() => {
    currentSelectedSession = null;
    clientGoMock.mockClear();
    conversationPaneSpy.mockClear();
    resourceGetMock.mockClear();
    sessionsRefreshMock.mockReset();
    sessionsRefreshMock.mockResolvedValue({
      collection: [],
      follow: vi.fn(),
      hasLink: vi.fn(() => false),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('disables provider and model overrides for an existing session', async () => {
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
          defaultModel: 'gpt-5-mini',
          defaultProviderId: 'opencode',
          orchestrationMode: 'ROUTA',
        }}
      />,
    );

    await waitFor(() => {
      const props = readConversationPaneProps();
      expect(props.providerPicker.disabled).toBe(true);
      expect(props.providerPicker.value).toBe('codex');
      expect(props.modelPicker.disabled).toBe(true);
      expect(props.modelPicker.providerId).toBe('codex');
      expect(props.modelPicker.value).toBe('gpt-5');
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
      codebase: null,
      completedAt: null,
      cwd: '/tmp/project-1',
      failureReason: null,
      id: input.id,
      lastActivityAt: '2026-03-16T00:00:00.000Z',
      lastEventId: null,
      model: input.model,
      name: 'Session 1',
      parentSession: null,
      project: { id: 'project-1' },
      provider: input.provider,
      specialistId: 'solo-developer',
      startedAt: '2026-03-16T00:00:00.000Z',
      worktree: null,
    },
    follow: vi.fn(),
    hasLink: vi.fn(() => false),
  } as unknown as State<AcpSession>;
}

function readConversationPaneProps(): {
  modelPicker: {
    disabled?: boolean;
    onValueChange?: (value: string | null) => void;
    providerId: string | null;
    value: string | null;
  };
  providerPicker: {
    disabled?: boolean;
    onValueChange: (value: string) => void;
    value: string | null;
  };
} {
  const props = conversationPaneSpy.mock.lastCall?.[0];

  expect(props).toBeDefined();

  return props as {
    modelPicker: {
      disabled?: boolean;
      onValueChange?: (value: string | null) => void;
      providerId: string | null;
      value: string | null;
    };
    providerPicker: {
      disabled?: boolean;
      onValueChange: (value: string) => void;
      value: string | null;
    };
  };
}
