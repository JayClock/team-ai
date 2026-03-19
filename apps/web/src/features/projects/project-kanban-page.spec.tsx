import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('ProjectKanbanPage', () => {
  beforeEach(() => {
    runtimeFetchMock.mockReset();
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
                  columnId: 'board-1_todo',
                  executionSessionId: null,
                  explain: {
                    currentColumnReason: 'Automation is currently running in Todo.',
                    latestAutomationResult: 'Automation session in progress',
                    missingArtifacts: ['local URL'],
                    recentTransitionReason: 'Waiting for the next implementation slice.',
                  },
                  id: 'task-1',
                  kind: 'implement',
                  lastSyncError: null,
                  position: 0,
                  priority: 'high',
                  resultSessionId: null,
                  status: 'READY',
                  title: 'Build Kanban page',
                  triggerSessionId: 'session-1',
                  updatedAt: '2026-03-19T00:00:00.000Z',
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
    expect(screen.getByText('Todo')).toBeTruthy();
    expect((await screen.findAllByText('Crafter Implementor')).length).toBe(2);
    expect(screen.getByText('Why Here')).toBeTruthy();
    expect(screen.getByText('Automation is currently running in Todo.')).toBeTruthy();
    expect(screen.getByText('local URL')).toBeTruthy();
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
                  columnId: 'board-1_todo',
                  executionSessionId: null,
                  explain: null,
                  id: 'task-1',
                  kind: 'implement',
                  lastSyncError: null,
                  position: 0,
                  priority: null,
                  resultSessionId: null,
                  status: 'READY',
                  title: 'Move me',
                  triggerSessionId: null,
                  updatedAt: '2026-03-19T00:00:00.000Z',
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
});
