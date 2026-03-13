import { State } from '@hateoas-ts/resource';
import { Project, ProjectRuntimeProfile } from '@shared/schema';
import { render, screen, waitFor } from '@testing-library/react';
import { ProjectSessionWorkbench } from './project-session-workbench';

const shellsSessionSpy = vi.fn((props: { runtimeProfile?: unknown }) => (
  <div data-testid="runtime-profile">
    {JSON.stringify(props.runtimeProfile ?? null)}
  </div>
));

vi.mock('@shells/session', () => ({
  ShellsSession: (props: { runtimeProfile?: unknown }) =>
    shellsSessionSpy(props),
}));

function createProjectState(
  getRuntimeProfile: () => Promise<State<ProjectRuntimeProfile>>,
): State<Project> {
  return {
    collection: [],
    data: {
      id: 'project-1',
    },
    follow: vi.fn((rel: string) => {
      if (rel !== 'runtime-profile') {
        throw new Error(`Unsupported rel: ${rel}`);
      }

      return {
        get: vi.fn(getRuntimeProfile),
      };
    }),
    hasLink: vi.fn((rel: string) => rel === 'runtime-profile'),
  } as unknown as State<Project>;
}

function createRuntimeProfileState(input: {
  defaultProviderId: string | null;
  orchestrationMode: ProjectRuntimeProfile['data']['orchestrationMode'];
}): State<ProjectRuntimeProfile> {
  return {
    collection: [],
    data: {
      id: 'rprof_1',
      projectId: 'project-1',
      defaultProviderId: input.defaultProviderId,
      defaultModel: null,
      orchestrationMode: input.orchestrationMode,
      enabledSkillIds: [],
      enabledMcpServerIds: [],
      skillConfigs: {},
      mcpServerConfigs: {},
      createdAt: '2026-03-13T00:00:00.000Z',
      updatedAt: '2026-03-13T00:00:00.000Z',
    },
    follow: vi.fn(),
    hasLink: vi.fn(() => false),
  } as unknown as State<ProjectRuntimeProfile>;
}

describe('ProjectSessionWorkbench', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes fetched provider and orchestration defaults to the session shell', async () => {
    const projectState = createProjectState(async () =>
      createRuntimeProfileState({
        defaultProviderId: 'opencode',
        orchestrationMode: 'DEVELOPER',
      }),
    );

    render(
      <ProjectSessionWorkbench
        projectState={projectState}
        projectTitle="Team AI"
      />,
    );

    expect(screen.getByText('null')).toBeTruthy();

    await waitFor(() => {
      expect(
        screen.getByText(
          '{"defaultProviderId":"opencode","orchestrationMode":"DEVELOPER"}',
        ),
      ).toBeTruthy();
    });

    expect(projectState.follow).toHaveBeenCalledWith('runtime-profile');
  });

  it('keeps a null runtime profile when the compatibility fetch fails', async () => {
    const projectState = createProjectState(async () => {
      throw new Error('runtime profile unavailable');
    });

    render(
      <ProjectSessionWorkbench
        projectState={projectState}
        projectTitle="Team AI"
      />,
    );

    await waitFor(() => {
      expect(projectState.follow).toHaveBeenCalledWith('runtime-profile');
    });

    expect(screen.getByText('null')).toBeTruthy();
    expect(shellsSessionSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ runtimeProfile: null }),
    );
  });
});
