import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectKanbanPage from './project-kanban-page';

const runtimeFetchMock = vi.fn();
const selectedProject = {
  data: {
    id: 'project-1',
    title: 'Team AI',
  },
};
const projects = [selectedProject];

vi.mock('@shared/util-http', () => ({
  getCurrentDesktopRuntimeConfig: () => null,
  resolveRuntimeApiUrl: (href: string) => `http://localhost${href}`,
  runtimeFetch: (...args: Parameters<typeof runtimeFetchMock>) =>
    runtimeFetchMock(...args),
}));

vi.mock('@shared/ui', async () => {
  const actual = await vi.importActual<typeof import('@shared/ui')>('@shared/ui');

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
      children,
      onClick,
    }: {
      children: ReactNode;
      onClick?: () => void;
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

vi.mock('@shells/sessions', () => ({
  projectTitle: (project: { data: { title: string } }) => project.data.title,
  useProjectSelection: () => ({
    projects,
    selectedProject,
  }),
}));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: {
        'Content-Type': 'application/json',
      },
      status,
    }),
  );
}

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly addEventListener = vi.fn(
    (type: string, listener: (event: MessageEvent<string>) => void) => {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
  );

  readonly close = vi.fn(() => {
    this.closed = true;
  });

  readonly listeners = new Map<
    string,
    Array<(event: MessageEvent<string>) => void>
  >();

  onerror: (() => void) | null = null;

  closed = false;

  constructor(
    readonly url: string,
    readonly eventSourceInitDict?: EventSourceInit,
  ) {
    MockEventSource.instances.push(this);
  }

  emit(type: string, data: unknown) {
    const event = {
      data: typeof data === 'string' ? data : JSON.stringify(data),
    } as MessageEvent<string>;

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('ProjectKanbanPage', () => {
  beforeEach(() => {
    runtimeFetchMock.mockReset();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders board columns and card details', async () => {
    runtimeFetchMock.mockImplementation((href: string) => {
      if (href.endsWith('/kanban/boards')) {
        return jsonResponse({
          _embedded: {
            boards: [{ id: 'board-1' }],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1')) {
        return jsonResponse({
          columns: [
            {
              automation: null,
              cards: [],
              id: 'board-1_backlog',
              name: 'Backlog',
              position: 0,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'routa-coordinator',
              recommendedSpecialistName: 'Routa Coordinator',
              stage: 'backlog',
            },
            {
              automation: {
                autoAdvanceOnSuccess: false,
                enabled: true,
                provider: null,
                requiredArtifacts: [],
                role: 'ROUTA',
                specialistId: 'todo-orchestrator',
                specialistName: 'Todo Orchestrator',
                transitionType: 'entry',
              },
              cards: [
                {
                  assignedRole: 'CRAFTER',
                  assignedSpecialistName: 'Crafter Implementor',
                  artifactEvidence: ['http://127.0.0.1:3000'],
                  columnId: 'board-1_todo',
                  completionSummary: 'Implementation summary',
                  executionSessionId: null,
                  explain: {
                    currentColumnReason: 'Automation is currently running in Todo.',
                    decisionLog: [
                      'Automation is currently running in Todo.',
                      'Automation session in progress',
                    ],
                    latestAutomationResult: 'Automation session in progress',
                    missingArtifacts: ['local URL'],
                    recentTransitionReason: 'Waiting for the next implementation slice.',
                  },
                  id: 'task-1',
                  kind: 'implement',
                  laneHandoffs: [
                    {
                      fromSessionId: 'session-prev',
                      id: 'handoff-1',
                      request: 'Share the local URL',
                      requestType: 'runtime_context',
                      requestedAt: '2026-03-19T00:00:00.000Z',
                      responseSummary: 'http://127.0.0.1:3000',
                      status: 'completed',
                      toSessionId: 'session-1',
                    },
                  ],
                  laneSessions: [
                    {
                      columnName: 'Todo',
                      sessionId: 'session-1',
                      startedAt: '2026-03-19T00:00:00.000Z',
                      status: 'running',
                    },
                  ],
                  lastSyncError: null,
                  position: 0,
                  priority: 'high',
                  recentOutputSummary: 'Implementation summary',
                  resultSessionId: null,
                  status: 'READY',
                  title: 'Build Kanban page',
                  triggerSessionId: 'session-1',
                  updatedAt: '2026-03-19T00:00:00.000Z',
                  verificationReport: 'Waiting for the next implementation slice.',
                  verificationVerdict: null,
                },
              ],
              id: 'board-1_todo',
              name: 'Todo',
              position: 1,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'todo-orchestrator',
              recommendedSpecialistName: 'Todo Orchestrator',
              stage: 'todo',
            },
          ],
          id: 'board-1',
          name: 'Workflow Board',
          projectId: 'project-1',
          settings: {
            boardConcurrency: 2,
            isDefault: true,
            wipLimit: 5,
          },
        });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter>
        <ProjectKanbanPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('Build Kanban page')).length).toBe(2);

    expect(screen.getByText('Backlog')).toBeTruthy();
    expect(screen.getAllByText('Todo').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Crafter Implementor')).length).toBe(2);
    expect(screen.getByText('Why Here')).toBeTruthy();
    expect(
      screen.getAllByText('Automation is currently running in Todo.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('local URL')).toBeTruthy();
    expect(screen.getByText('Lane Sessions')).toBeTruthy();
    expect(screen.getByText('Lane Handoffs')).toBeTruthy();
    expect(screen.getByText('Artifact Evidence')).toBeTruthy();
  });

  it('sends a move request from the card menu', async () => {
    runtimeFetchMock.mockImplementation((href: string, init?: RequestInit) => {
      if (href.endsWith('/kanban/boards')) {
        return jsonResponse({
          _embedded: {
            boards: [{ id: 'board-1' }],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1')) {
        return jsonResponse({
          columns: [
            {
              automation: null,
              cards: [
                {
                  assignedRole: 'CRAFTER',
                  assignedSpecialistName: 'Crafter Implementor',
                  artifactEvidence: [],
                  columnId: 'board-1_todo',
                  completionSummary: null,
                  executionSessionId: null,
                  explain: null,
                  id: 'task-1',
                  kind: 'implement',
                  laneHandoffs: [],
                  laneSessions: [],
                  lastSyncError: null,
                  position: 0,
                  priority: null,
                  recentOutputSummary: null,
                  resultSessionId: null,
                  status: 'READY',
                  title: 'Move me',
                  triggerSessionId: null,
                  updatedAt: '2026-03-19T00:00:00.000Z',
                  verificationReport: null,
                  verificationVerdict: null,
                },
              ],
              id: 'board-1_todo',
              name: 'Todo',
              position: 0,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'todo-orchestrator',
              recommendedSpecialistName: 'Todo Orchestrator',
              stage: 'todo',
            },
            {
              automation: null,
              cards: [],
              id: 'board-1_blocked',
              name: 'Blocked',
              position: 1,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'blocked-resolver',
              recommendedSpecialistName: 'Blocked Resolver',
              stage: 'blocked',
            },
          ],
          id: 'board-1',
          name: 'Workflow Board',
          projectId: 'project-1',
          settings: {
            boardConcurrency: null,
            isDefault: true,
            wipLimit: null,
          },
        });
      }

      if (href.endsWith('/tasks/task-1/move')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(
          JSON.stringify({
            boardId: 'board-1',
            columnId: 'board-1_blocked',
          }),
        );

        return jsonResponse({
          id: 'task-1',
        });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter>
        <ProjectKanbanPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('Move me')).length).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Move to Blocked' }));

    await waitFor(() => {
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/tasks/task-1/move',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('sends a positioned move request from drag and drop', async () => {
    runtimeFetchMock.mockImplementation((href: string, init?: RequestInit) => {
      if (href.endsWith('/kanban/boards')) {
        return jsonResponse({
          _embedded: {
            boards: [{ id: 'board-1' }],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1')) {
        return jsonResponse({
          columns: [
            {
              automation: null,
              cards: [
                {
                  assignedRole: 'CRAFTER',
                  assignedSpecialistName: 'Crafter Implementor',
                  artifactEvidence: [],
                  columnId: 'board-1_todo',
                  completionSummary: null,
                  executionSessionId: null,
                  explain: null,
                  id: 'task-1',
                  kind: 'implement',
                  laneHandoffs: [],
                  laneSessions: [],
                  lastSyncError: null,
                  position: 0,
                  priority: null,
                  recentOutputSummary: null,
                  resultSessionId: null,
                  status: 'READY',
                  title: 'Drag me',
                  triggerSessionId: null,
                  updatedAt: '2026-03-19T00:00:00.000Z',
                  verificationReport: null,
                  verificationVerdict: null,
                },
              ],
              id: 'board-1_todo',
              name: 'Todo',
              position: 0,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'todo-orchestrator',
              recommendedSpecialistName: 'Todo Orchestrator',
              stage: 'todo',
            },
            {
              automation: null,
              cards: [],
              id: 'board-1_review',
              name: 'Review',
              position: 1,
              recommendedRole: 'GATE',
              recommendedSpecialistId: 'gate-reviewer',
              recommendedSpecialistName: 'Gate Reviewer',
              stage: 'review',
            },
          ],
          id: 'board-1',
          name: 'Workflow Board',
          projectId: 'project-1',
          settings: {
            boardConcurrency: null,
            isDefault: true,
            wipLimit: null,
          },
        });
      }

      if (href.endsWith('/tasks/task-1/move')) {
        expect(init?.body).toBe(
          JSON.stringify({
            boardId: 'board-1',
            columnId: 'board-1_review',
            position: 0,
          }),
        );
        return jsonResponse({ id: 'task-1' });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter>
        <ProjectKanbanPage />
      </MemoryRouter>,
    );

    await screen.findAllByText('Drag me');

    const draggableCard = screen.getAllByText('Drag me')[0].closest('[draggable="true"]');
    const emptyReviewState = screen.getByText('当前列还没有卡片。');
    const dataTransfer = {
      effectAllowed: 'move',
      setData: vi.fn(),
    } as unknown as DataTransfer;

    fireEvent.dragStart(draggableCard as HTMLElement, { dataTransfer });
    fireEvent.dragOver(emptyReviewState);
    fireEvent.drop(emptyReviewState, { dataTransfer });

    await waitFor(() => {
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/tasks/task-1/move',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('submits a natural-language goal intake and refreshes the board', async () => {
    let boardLoads = 0;

    runtimeFetchMock.mockImplementation((href: string, init?: RequestInit) => {
      if (href.endsWith('/kanban/boards')) {
        return jsonResponse({
          _embedded: {
            boards: [{ id: 'board-1' }],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1')) {
        boardLoads += 1;
        return jsonResponse({
          columns: [
            {
              automation: null,
              cards: [],
              id: 'board-1_backlog',
              name: 'Backlog',
              position: 0,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'routa-coordinator',
              recommendedSpecialistName: 'Routa Coordinator',
              stage: 'backlog',
            },
          ],
          id: 'board-1',
          name: 'Workflow Board',
          projectId: 'project-1',
          settings: {
            boardConcurrency: null,
            isDefault: true,
            wipLimit: null,
          },
        });
      }

      if (href.endsWith('/kanban/intake')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          acceptanceHints: ['Users can log in with email and password'],
          artifactHints: ['login screen screenshot'],
          constraints: ['Use the existing auth store'],
          goal: 'Build a user authentication flow',
        });

        return jsonResponse({
          archivedTaskIds: [],
          createdTaskIds: ['task-1', 'task-2', 'task-3'],
          decomposition: {
            goal: 'Build a user authentication flow',
            tasks: [
              {
                kind: 'plan',
                owner: 'Todo Orchestrator',
                title: 'Refine Build a user authentication flow',
              },
              {
                kind: 'implement',
                owner: 'Crafter Implementor',
                title: 'Implement Build a user authentication flow',
              },
              {
                kind: 'review',
                owner: 'Gate Reviewer',
                title: 'Review Build a user authentication flow',
              },
            ],
          },
          note: {
            id: 'note-1',
            updatedAt: '2026-03-19T00:00:00.000Z',
          },
          parsedTaskCount: 3,
          specFragment: '## Intake Goal · Build a user authentication flow',
          updatedTaskIds: [],
        });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter>
        <ProjectKanbanPage />
      </MemoryRouter>,
    );

    await screen.findByText('Project Kanban');

    fireEvent.click(screen.getByRole('button', { name: 'New Goal' }));
    fireEvent.change(screen.getByLabelText('Goal'), {
      target: {
        value: 'Build a user authentication flow',
      },
    });
    fireEvent.change(screen.getByLabelText('Constraints'), {
      target: {
        value: 'Use the existing auth store',
      },
    });
    fireEvent.change(screen.getByLabelText('Acceptance Hints'), {
      target: {
        value: 'Users can log in with email and password',
      },
    });
    fireEvent.change(screen.getByLabelText('Artifact Hints'), {
      target: {
        value: 'login screen screenshot',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate Cards' }));

    await screen.findByText('Generated Task Drafts');
    expect(
      screen.getByText('Refine Build a user authentication flow'),
    ).toBeTruthy();

    await waitFor(() => {
      expect(boardLoads).toBeGreaterThanOrEqual(2);
    });
  });

  it('subscribes to the kanban event stream and refreshes on realtime events', async () => {
    let boardLoads = 0;

    runtimeFetchMock.mockImplementation((href: string) => {
      if (href.endsWith('/kanban/boards')) {
        return jsonResponse({
          _embedded: {
            boards: [{ id: 'board-1' }],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1')) {
        boardLoads += 1;
        return jsonResponse({
          columns: [
            {
              automation: null,
              cards: [],
              id: 'board-1_todo',
              name: 'Todo',
              position: 0,
              recommendedRole: 'ROUTA',
              recommendedSpecialistId: 'todo-orchestrator',
              recommendedSpecialistName: 'Todo Orchestrator',
              stage: 'todo',
            },
          ],
          id: 'board-1',
          name: 'Workflow Board',
          projectId: 'project-1',
          settings: {
            boardConcurrency: null,
            isDefault: true,
            wipLimit: null,
          },
        });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter>
        <ProjectKanbanPage />
      </MemoryRouter>,
    );

    await screen.findByText('Project Kanban');

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toContain(
      '/api/projects/project-1/kanban/events/stream?boardId=board-1',
    );

    await act(async () => {
      MockEventSource.instances[0]?.emit('connected', {
        boardId: 'board-1',
        projectId: 'project-1',
      });
    });

    await screen.findByText('Live stream active');

    await act(async () => {
      MockEventSource.instances[0]?.emit('kanban-event', {
        boardId: 'board-1',
        fromColumnId: 'board-1_backlog',
        projectId: 'project-1',
        taskId: 'task-1',
        taskTitle: 'Realtime card',
        toColumnId: 'board-1_todo',
        type: 'task.column-transition',
      });
    });

    await waitFor(() => {
      expect(boardLoads).toBeGreaterThan(1);
    });

    expect(screen.getByText(/Realtime card moved into board-1_todo/)).toBeTruthy();
  });
});
