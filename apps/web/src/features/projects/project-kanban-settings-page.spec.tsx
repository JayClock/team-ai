import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectKanbanSettingsPage from './project-kanban-settings-page';

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

vi.mock('@shells/sessions', () => ({
  projectTitle: (project: { data: { title: string } }) => project.data.title,
  useProjectSelection: () => ({
    projects,
    selectedProject,
  }),
}));

vi.mock('@shared/ui', async () => {
  const actual = await vi.importActual<typeof import('@shared/ui')>('@shared/ui');

  return {
    ...actual,
    ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  };
});

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

describe('ProjectKanbanSettingsPage', () => {
  beforeEach(() => {
    runtimeFetchMock.mockReset();
  });

  it('loads board settings and saves board metadata plus new columns', async () => {
    runtimeFetchMock.mockImplementation((href: string, init?: RequestInit) => {
      if (href.endsWith('/specialists') && !init?.method) {
        return jsonResponse({
          _embedded: {
            specialists: [
              {
                defaultAdapter: 'codex',
                id: 'todo-orchestrator',
                name: 'Todo Orchestrator',
                role: 'ROUTA',
                source: {
                  scope: 'builtin',
                },
              },
            ],
          },
        });
      }

      if (href.endsWith('/kanban/boards') && !init?.method) {
        return jsonResponse({
          _embedded: {
            boards: [
              {
                id: 'board-1',
                name: 'Workflow Board',
                settings: {
                  boardConcurrency: 2,
                  isDefault: true,
                  wipLimit: 5,
                },
              },
            ],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1') && !init?.method) {
        return jsonResponse({
          columns: [
            {
              automation: {
                autoAdvanceOnSuccess: true,
                enabled: true,
                provider: null,
                requiredArtifacts: ['local URL'],
                role: 'ROUTA',
                specialistId: 'todo-orchestrator',
                specialistName: 'Todo Orchestrator',
                transitionType: 'entry',
              },
              id: 'board-1_todo',
              name: 'Todo',
              position: 0,
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

      if (href.endsWith('/kanban/boards/board-1') && init?.method === 'PATCH') {
        expect(init.body).toBe(
          JSON.stringify({
            isDefault: true,
            name: 'Workflow Board Updated',
            settings: {
              boardConcurrency: 3,
              wipLimit: 7,
            },
          }),
        );

        return jsonResponse({
          columns: [],
          id: 'board-1',
          name: 'Workflow Board Updated',
          projectId: 'project-1',
          settings: {
            boardConcurrency: 3,
            isDefault: true,
            wipLimit: 7,
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1/columns') && init?.method === 'POST') {
        expect(init.body).toBe(
          JSON.stringify({
            name: 'QA Gate',
            stage: 'todo',
          }),
        );

        return jsonResponse({
          id: 'board-1',
        });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter initialEntries={['/projects/project-1/kanban/settings']}>
        <Routes>
          <Route
            path="/projects/:projectId/kanban/settings"
            element={<ProjectKanbanSettingsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('Workflow Board')).toBeTruthy();
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Workflow Board'), {
      target: { value: 'Workflow Board Updated' },
    });
    fireEvent.change(screen.getByDisplayValue('2'), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByDisplayValue('5'), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Board' }));

    await waitFor(() => {
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/kanban/boards/board-1',
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });

    fireEvent.change(screen.getByPlaceholderText('New column name'), {
      target: { value: 'QA Gate' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Column/i }));

    await waitFor(() => {
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/kanban/boards/board-1/columns',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('loads project specialists and uses them for column bindings', async () => {
    runtimeFetchMock.mockImplementation((href: string, init?: RequestInit) => {
      if (href.endsWith('/specialists') && !init?.method) {
        return jsonResponse({
          _embedded: {
            specialists: [
              {
                defaultAdapter: 'codex',
                id: 'planner-override',
                name: 'Planner Override',
                role: 'ROUTA',
                source: {
                  scope: 'user',
                },
              },
            ],
          },
        });
      }

      if (href.endsWith('/kanban/boards') && !init?.method) {
        return jsonResponse({
          _embedded: {
            boards: [
              {
                id: 'board-1',
                name: 'Workflow Board',
                settings: {
                  boardConcurrency: null,
                  isDefault: true,
                  wipLimit: null,
                },
              },
            ],
          },
        });
      }

      if (href.endsWith('/kanban/boards/board-1') && !init?.method) {
        return jsonResponse({
          columns: [
            {
              automation: null,
              id: 'board-1_todo',
              name: 'Todo',
              position: 0,
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

      if (
        href.endsWith('/kanban/boards/board-1/columns/board-1_todo') &&
        init?.method === 'PATCH'
      ) {
        expect(init.body).toBe(
          JSON.stringify({
            automation: {
              allowedSourceColumnIds: [],
              autoAdvanceOnSuccess: false,
              enabled: false,
              manualApprovalRequired: false,
              provider: 'codex',
              requiredArtifacts: [],
              role: 'ROUTA',
              specialistId: 'planner-override',
              specialistName: 'Planner Override',
              transitionType: 'entry',
            },
            name: 'Todo',
            position: 0,
            stage: 'todo',
          }),
        );

        return jsonResponse({
          id: 'board-1',
        });
      }

      throw new Error(`Unexpected request: ${href}`);
    });

    render(
      <MemoryRouter initialEntries={['/projects/project-1/kanban/settings']}>
        <Routes>
          <Route
            path="/projects/:projectId/kanban/settings"
            element={<ProjectKanbanSettingsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByDisplayValue('Workflow Board');
    fireEvent.change(screen.getByLabelText('Specialist for Todo'), {
      target: { value: 'planner-override' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Column' }));

    await waitFor(() => {
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/kanban/boards/board-1/columns/board-1_todo',
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });
  });
});
