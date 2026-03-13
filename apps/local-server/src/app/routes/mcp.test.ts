import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { createAgent } from '../services/agent-service';
import { getNoteById } from '../services/note-service';
import { createProject } from '../services/project-service';
import { createTask } from '../services/task-service';
import { insertAcpSession } from '../test-support/acp-session-fixture';
import acpRoute from './acp';
import mcpRoute from './mcp';
import projectsRoute from './projects';
import rootRoute from './root';

describe('mcp route', () => {
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];
  const originalDataDir = process.env.TEAMAI_DATA_DIR;

  afterEach(async () => {
    process.env.TEAMAI_DATA_DIR = originalDataDir;

    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }
  });

  it('lists and executes built-in local mcp tools', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-test-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const promptMock = vi.fn(async () => ({
      runtimeSessionId: 'runtime-1',
      response: {
        stopReason: 'end_turn' as const,
      },
    }));

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: 'runtime-1',
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: promptMock,
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(rootRoute, { prefix: '/api' });
    await fastify.register(projectsRoute, { prefix: '/api' });
    await fastify.register(acpRoute, { prefix: '/api' });
    await fastify.register(mcpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'Local MCP Project',
      repoPath: '/tmp/team-ai-local-mcp-project',
    });
    await createAgent(fastify.sqlite, {
      projectId: project.id,
      name: 'Planner',
      role: 'planner',
      provider: 'codex',
      model: 'gpt-5',
      systemPrompt: 'Plan tasks',
    });
    const rootSessionId = 'acps_mcp_root';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-local-mcp-project',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });
    const task = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'Implement MCP task tools',
      objective: 'Allow agents to read task lists and task details',
      status: 'PENDING',
      kind: 'implement',
      labels: ['mcp'],
      triggerSessionId: rootSessionId,
    });
    const completedTask = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'Do not execute completed tasks',
      objective: 'Ensure MCP execution rejects terminal tasks',
      status: 'COMPLETED',
      kind: 'implement',
      triggerSessionId: rootSessionId,
    });

    const listToolsResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-1',
        method: 'tools/list',
        params: {},
      },
    });

    expect(listToolsResponse.statusCode).toBe(200);
    expect(
      listToolsResponse
        .json()
        .result.tools.map((tool: { name: string }) => tool.name),
    ).toEqual(
      expect.arrayContaining([
        'projects_list',
        'agents_list',
        'tasks_list',
        'task_get',
        'task_update',
        'task_execute',
        'task_runs_list',
        'notes_append',
        'acp_session_create',
        'acp_session_prompt',
        'acp_session_cancel',
      ]),
    );

    const listProjectsResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-2',
        method: 'tools/call',
        params: {
          name: 'projects_list',
          arguments: {},
        },
      },
    });

    expect(listProjectsResponse.statusCode).toBe(200);
    expect(listProjectsResponse.json().result.content[0].json.items[0].id).toBe(
      project.id,
    );

    const listAgentsResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-agents',
        method: 'tools/call',
        params: {
          name: 'agents_list',
          arguments: {
            projectId: project.id,
          },
        },
      },
    });

    expect(listAgentsResponse.statusCode).toBe(200);
    expect(
      listAgentsResponse.json().result.content[0].json.items[0],
    ).toMatchObject({
      projectId: project.id,
      name: 'Planner',
    });

    const listTasksResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-tasks',
        method: 'tools/call',
        params: {
          name: 'tasks_list',
          arguments: {
            projectId: project.id,
            status: 'PENDING',
          },
        },
      },
    });

    expect(listTasksResponse.statusCode).toBe(200);
    expect(
      listTasksResponse.json().result.content[0].json.items[0],
    ).toMatchObject({
      id: task.id,
      projectId: project.id,
      status: 'PENDING',
      title: 'Implement MCP task tools',
    });

    const getTaskResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task',
        method: 'tools/call',
        params: {
          name: 'task_get',
          arguments: {
            projectId: project.id,
            taskId: task.id,
          },
        },
      },
    });

    expect(getTaskResponse.statusCode).toBe(200);
    expect(getTaskResponse.json().result.content[0].json).toMatchObject({
      task: {
        id: task.id,
        kind: 'implement',
        labels: ['mcp'],
        projectId: project.id,
      },
    });

    const invalidTaskGetResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task-invalid',
        method: 'tools/call',
        params: {
          name: 'task_get',
          arguments: {
            taskId: task.id,
          },
        },
      },
    });

    expect(invalidTaskGetResponse.statusCode).toBe(200);
    expect(invalidTaskGetResponse.json()).toMatchObject({
      error: {
        code: -32000,
        message: expect.stringContaining('projectId'),
      },
      result: null,
    });

    const taskUpdateResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task-update',
        method: 'tools/call',
        params: {
          name: 'task_update',
          arguments: {
            projectId: project.id,
            taskId: task.id,
            status: 'READY',
            completionSummary: 'Ready for local execution',
          },
        },
      },
    });

    expect(taskUpdateResponse.statusCode).toBe(200);
    expect(taskUpdateResponse.json().result.content[0].json).toMatchObject({
      task: {
        id: task.id,
        status: 'READY',
        completionSummary: 'Ready for local execution',
      },
    });

    const invalidTaskUpdateResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task-update-invalid',
        method: 'tools/call',
        params: {
          name: 'task_update',
          arguments: {
            projectId: project.id,
            taskId: task.id,
            status: 'RUNNING',
          },
        },
      },
    });

    expect(invalidTaskUpdateResponse.statusCode).toBe(200);
    expect(invalidTaskUpdateResponse.json()).toMatchObject({
      error: {
        code: -32000,
        message: expect.stringContaining('WAITING_RETRY'),
      },
      result: null,
    });

    const taskExecuteResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task-execute',
        method: 'tools/call',
        params: {
          name: 'task_execute',
          arguments: {
            projectId: project.id,
            taskId: task.id,
          },
        },
      },
    });

    expect(taskExecuteResponse.statusCode).toBe(200);
    expect(taskExecuteResponse.json().result.content[0].json).toMatchObject({
      dispatch: {
        attempted: true,
        errorMessage: null,
        result: {
          dispatched: true,
          reason: null,
          role: 'CRAFTER',
        },
      },
      task: {
        id: task.id,
        status: 'COMPLETED',
      },
    });
    expect(promptMock).toHaveBeenCalledTimes(1);

    const taskRunsResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task-runs',
        method: 'tools/call',
        params: {
          name: 'task_runs_list',
          arguments: {
            projectId: project.id,
            taskId: task.id,
          },
        },
      },
    });

    expect(taskRunsResponse.statusCode).toBe(200);
    expect(taskRunsResponse.json().result.content[0].json).toMatchObject({
      items: [
        expect.objectContaining({
          isLatest: true,
          status: 'COMPLETED',
          summary: 'ACP session completed',
          taskId: task.id,
        }),
      ],
      projectId: project.id,
      taskId: task.id,
      total: 1,
    });

    const taskRunSessionId = taskRunsResponse.json().result.content[0].json
      .items[0].sessionId as string;

    const appendNoteResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-note-append',
        method: 'tools/call',
        params: {
          name: 'notes_append',
          arguments: {
            projectId: project.id,
            sessionId: taskRunSessionId,
            taskId: task.id,
            title: 'Review Summary',
            content: '## Verdict\n\n- pass',
            assignedAgentIds: ['agent-reviewer'],
          },
        },
      },
    });

    expect(appendNoteResponse.statusCode).toBe(200);
    expect(appendNoteResponse.json().result.content[0].json).toMatchObject({
      note: {
        assignedAgentIds: ['agent-reviewer'],
        content: '## Verdict\n\n- pass',
        linkedTaskId: task.id,
        projectId: project.id,
        sessionId: taskRunSessionId,
        source: 'agent',
        title: 'Review Summary',
        type: 'general',
      },
      scope: {
        ownership: 'session',
        projectId: project.id,
        sessionId: taskRunSessionId,
        taskId: task.id,
      },
    });

    const createdNoteId = appendNoteResponse.json().result.content[0].json.note
      .id as string;
    expect(await getNoteById(fastify.sqlite, createdNoteId)).toMatchObject({
      id: createdNoteId,
      linkedTaskId: task.id,
      sessionId: taskRunSessionId,
      title: 'Review Summary',
    });

    const invalidTaskExecuteResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-task-execute-invalid',
        method: 'tools/call',
        params: {
          name: 'task_execute',
          arguments: {
            projectId: project.id,
            taskId: completedTask.id,
          },
        },
      },
    });

    expect(invalidTaskExecuteResponse.statusCode).toBe(200);
    expect(invalidTaskExecuteResponse.json()).toMatchObject({
      error: {
        code: -32000,
        message: expect.stringContaining('COMPLETED'),
      },
      result: null,
    });

    const createAcpResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-3',
        method: 'tools/call',
        params: {
          name: 'acp_session_create',
          arguments: {
            projectId: project.id,
            actorUserId: 'desktop-user',
            provider: 'codex',
          },
        },
      },
    });

    expect(createAcpResponse.statusCode).toBe(200);
    const acpSessionId = createAcpResponse.json().result.content[0].json.session
      .id as string;
    expect(acpSessionId).toMatch(/^acps_/);

    const promptAcpResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 'mcp-4',
        method: 'tools/call',
        params: {
          name: 'acp_session_prompt',
          arguments: {
            projectId: project.id,
            sessionId: acpSessionId,
            prompt: 'hello from mcp',
          },
        },
      },
    });

    expect(promptAcpResponse.statusCode).toBe(200);
    expect(promptMock).toHaveBeenCalledTimes(2);
  });
});
