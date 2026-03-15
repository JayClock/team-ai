import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpRuntimeClient } from '../clients/acp-runtime-client';
import acpStreamPlugin from '../plugins/acp-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import sqlitePlugin from '../plugins/sqlite';
import { createAgent } from '../services/agent-service';
import { createNote, getNoteById } from '../services/note-service';
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

  async function callMcp(
    fastify: ReturnType<typeof Fastify>,
    payload: Record<string, unknown>,
    accessMode?: 'read-only' | 'read-write',
  ) {
    return fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: accessMode
        ? {
            'x-teamai-mcp-access-mode': accessMode,
          }
        : undefined,
      payload,
    });
  }

  function createLogger() {
    const logger = {
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      info: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
    };

    logger.child.mockReturnValue(logger);
    return logger;
  }

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
      sessionId: rootSessionId,
    });
    const completedTask = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'Do not execute completed tasks',
      objective: 'Ensure MCP execution rejects terminal tasks',
      status: 'COMPLETED',
      kind: 'implement',
      sessionId: rootSessionId,
    });

    const listToolsResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-1',
        method: 'tools/list',
        params: {},
      },
      'read-write',
    );

    expect(listToolsResponse.statusCode).toBe(200);
    const listedTools = listToolsResponse.json().result.tools as Array<{
      annotations?: { readOnlyHint?: boolean };
      name: string;
    }>;
    expect(listedTools.map((tool) => tool.name)).toEqual(
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
    expect(listedTools.find((tool) => tool.name === 'task_get')).toMatchObject({
      annotations: {
        readOnlyHint: true,
      },
    });
    expect(
      listedTools.find((tool) => tool.name === 'task_update'),
    ).toMatchObject({
      annotations: {
        readOnlyHint: false,
      },
    });

    const listProjectsResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-2',
        method: 'tools/call',
        params: {
          name: 'projects_list',
          arguments: {},
        },
      },
      'read-write',
    );

    expect(listProjectsResponse.statusCode).toBe(200);
    expect(listProjectsResponse.json().result.content[0].json.items[0].id).toBe(
      project.id,
    );

    const listAgentsResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(listAgentsResponse.statusCode).toBe(200);
    expect(
      listAgentsResponse.json().result.content[0].json.items[0],
    ).toMatchObject({
      projectId: project.id,
      name: 'Planner',
    });

    const listTasksResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(listTasksResponse.statusCode).toBe(200);
    expect(
      listTasksResponse.json().result.content[0].json.items[0],
    ).toMatchObject({
      id: task.id,
      projectId: project.id,
      status: 'PENDING',
      title: 'Implement MCP task tools',
    });

    const getTaskResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(getTaskResponse.statusCode).toBe(200);
    expect(getTaskResponse.json().result.content[0].json).toMatchObject({
      task: {
        id: task.id,
        kind: 'implement',
        labels: ['mcp'],
        projectId: project.id,
      },
    });

    const invalidTaskGetResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(invalidTaskGetResponse.statusCode).toBe(200);
    expect(invalidTaskGetResponse.json()).toMatchObject({
      error: {
        code: -32602,
        data: {
          problem: {
            status: 400,
            title: 'Invalid Request',
            type: 'https://team-ai.dev/problems/invalid-request',
          },
        },
        message: expect.stringContaining('projectId'),
      },
      result: null,
    });

    const taskUpdateResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(taskUpdateResponse.statusCode).toBe(200);
    expect(taskUpdateResponse.json().result.content[0].json).toMatchObject({
      task: {
        id: task.id,
        status: 'READY',
        completionSummary: 'Ready for local execution',
      },
    });

    const invalidTaskUpdateResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(invalidTaskUpdateResponse.statusCode).toBe(200);
    expect(invalidTaskUpdateResponse.json()).toMatchObject({
      error: {
        code: -32602,
        message: expect.stringContaining('WAITING_RETRY'),
      },
      result: null,
    });

    const taskExecuteResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

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

    const taskRunsResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

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

    const appendNoteResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

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

    const invalidTaskExecuteResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(invalidTaskExecuteResponse.statusCode).toBe(200);
    expect(invalidTaskExecuteResponse.json()).toMatchObject({
      error: {
        code: -32000,
        message: expect.stringContaining('COMPLETED'),
      },
      result: null,
    });

    const createAcpResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(createAcpResponse.statusCode).toBe(200);
    const acpSessionId = createAcpResponse.json().result.content[0].json.session
      .id as string;
    expect(acpSessionId).toMatch(/^acps_/);

    const promptAcpResponse = await callMcp(
      fastify,
      {
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
      'read-write',
    );

    expect(promptAcpResponse.statusCode).toBe(200);
    expect(promptMock).toHaveBeenCalledTimes(2);
  });

  it('defaults MCP access to read-only and returns problem details for denied writes', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-readonly-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: 'runtime-readonly',
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-readonly',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
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
      title: 'Read Only MCP Project',
      repoPath: '/tmp/team-ai-mcp-readonly-project',
    });
    const task = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'Read only tool test',
      objective: 'Verify write tools require elevated MCP access',
      status: 'PENDING',
      kind: 'implement',
    });

    const listToolsResponse = await callMcp(fastify, {
      jsonrpc: '2.0',
      id: 'mcp-readonly-tools',
      method: 'tools/list',
      params: {},
    });

    expect(listToolsResponse.statusCode).toBe(200);
    const toolNames = listToolsResponse
      .json()
      .result.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'projects_list',
        'agents_list',
        'tasks_list',
        'task_get',
        'task_runs_list',
      ]),
    );
    expect(toolNames).not.toContain('task_update');
    expect(toolNames).not.toContain('task_execute');
    expect(toolNames).not.toContain('notes_append');
    expect(toolNames).not.toContain('acp_session_create');
    expect(toolNames).not.toContain('acp_session_prompt');
    expect(toolNames).not.toContain('acp_session_cancel');

    const deniedWriteResponse = await callMcp(fastify, {
      jsonrpc: '2.0',
      id: 'mcp-readonly-write',
      method: 'tools/call',
      params: {
        name: 'task_update',
        arguments: {
          projectId: project.id,
          taskId: task.id,
          status: 'READY',
        },
      },
    });

    expect(deniedWriteResponse.statusCode).toBe(200);
    expect(deniedWriteResponse.json()).toMatchObject({
      error: {
        code: -32000,
        data: {
          problem: {
            status: 403,
            title: 'MCP Write Access Required',
            type: 'https://team-ai.dev/problems/mcp-write-access-required',
          },
        },
        message: expect.stringContaining('x-teamai-mcp-access-mode'),
      },
      result: null,
    });
  });

  it('adds write diagnostics logs and problem context for MCP write failures', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-diagnostics-${Date.now()}`;

    const logger = createLogger();
    const fastify = Fastify({ loggerInstance: logger as never });
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.provider}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-diagnostics',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
    } satisfies AcpRuntimeClient);

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(sqlitePlugin);
    await fastify.register(acpStreamPlugin);
    await fastify.register(mcpRoute, { prefix: '/api' });
    await fastify.ready();

    const project = await createProject(fastify.sqlite, {
      title: 'MCP Diagnostics Project',
      repoPath: '/tmp/team-ai-mcp-diagnostics-project',
    });
    const task = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'MCP diagnostics task',
      objective: 'Exercise MCP write failure diagnostics',
      status: 'PENDING',
      kind: 'implement',
    });

    const response = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-write-diagnostics',
        method: 'tools/call',
        params: {
          name: 'task_update',
          arguments: {
            projectId: project.id,
            taskId: task.id,
            status: 'WAITING_RETRY',
          },
        },
      },
      'read-write',
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      error: {
        code: -32000,
        data: {
          problem: {
            code: 'TASK_STATUS_TRANSITION_NOT_ALLOWED',
            context: {
              currentStatus: 'PENDING',
              mutationKeys: ['status'],
              nextStatus: 'WAITING_RETRY',
              taskId: task.id,
              toolName: 'task_update',
            },
            status: 409,
            title: 'Task Status Transition Not Allowed',
          },
        },
      },
      result: null,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mcp.tool.audit',
        mutationKeys: ['status'],
        phase: 'failure',
        problem: expect.objectContaining({
          code: 'TASK_STATUS_TRANSITION_NOT_ALLOWED',
          context: expect.objectContaining({
            currentStatus: 'PENDING',
            nextStatus: 'WAITING_RETRY',
            taskId: task.id,
            toolName: 'task_update',
          }),
        }),
        taskId: task.id,
        toolAccess: 'write',
        toolName: 'task_update',
      }),
      'MCP tool audit failure',
    );
  });

  it('rejects cross-project task, run, and note scope arguments', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-scope-boundary-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.provider}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-scope-boundary',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
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

    const ownerProject = await createProject(fastify.sqlite, {
      title: 'Scope Owner Project',
      repoPath: '/tmp/team-ai-mcp-scope-owner-project',
    });
    const foreignProject = await createProject(fastify.sqlite, {
      title: 'Scope Foreign Project',
      repoPath: '/tmp/team-ai-mcp-scope-foreign-project',
    });
    const ownerTask = await createTask(fastify.sqlite, {
      projectId: ownerProject.id,
      title: 'Owner task',
      objective: 'Stay inside the owner project scope',
      status: 'PENDING',
      kind: 'implement',
    });
    const foreignTask = await createTask(fastify.sqlite, {
      projectId: foreignProject.id,
      title: 'Foreign task',
      objective: 'Should not leak into another project scope',
      status: 'PENDING',
      kind: 'implement',
    });

    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-scope-owner-project',
      id: 'acps_scope_owner_root',
      projectId: ownerProject.id,
      provider: 'codex',
    });
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-scope-foreign-project',
      id: 'acps_scope_foreign_root',
      projectId: foreignProject.id,
      provider: 'codex',
    });

    const foreignNote = await createNote(fastify.sqlite, {
      projectId: foreignProject.id,
      title: 'Foreign note',
      content: 'This note belongs to the foreign project.',
      source: 'agent',
      type: 'general',
    });

    const crossProjectTaskResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-cross-project-task',
        method: 'tools/call',
        params: {
          name: 'task_get',
          arguments: {
            projectId: ownerProject.id,
            taskId: foreignTask.id,
          },
        },
      },
      'read-write',
    );

    expect(crossProjectTaskResponse.statusCode).toBe(200);
    expect(crossProjectTaskResponse.json()).toMatchObject({
      error: {
        code: -32000,
        data: {
          problem: {
            status: 409,
            title: 'Task Project Mismatch',
            type: 'https://team-ai.dev/problems/task-project-mismatch',
          },
        },
        message: expect.stringContaining(foreignTask.id),
      },
      result: null,
    });

    const crossProjectRunsResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-cross-project-runs',
        method: 'tools/call',
        params: {
          name: 'task_runs_list',
          arguments: {
            projectId: ownerProject.id,
            sessionId: 'acps_scope_foreign_root',
            taskId: ownerTask.id,
          },
        },
      },
      'read-write',
    );

    expect(crossProjectRunsResponse.statusCode).toBe(200);
    expect(crossProjectRunsResponse.json()).toMatchObject({
      error: {
        code: -32000,
        data: {
          problem: {
            status: 409,
            title: 'MCP Project Boundary Violation',
            type: 'https://team-ai.dev/problems/mcp-project-boundary-violation',
          },
        },
        message: expect.stringContaining('acps_scope_foreign_root'),
      },
      result: null,
    });

    const crossProjectNoteResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-cross-project-note',
        method: 'tools/call',
        params: {
          name: 'notes_append',
          arguments: {
            projectId: ownerProject.id,
            title: 'Owner note',
            content: 'This should fail before writing any note.',
            parentNoteId: foreignNote.id,
            taskId: ownerTask.id,
          },
        },
      },
      'read-write',
    );

    expect(crossProjectNoteResponse.statusCode).toBe(200);
    expect(crossProjectNoteResponse.json()).toMatchObject({
      error: {
        code: -32000,
        data: {
          problem: {
            status: 409,
            title: 'MCP Project Boundary Violation',
            type: 'https://team-ai.dev/problems/mcp-project-boundary-violation',
          },
        },
        message: expect.stringContaining(foreignNote.id),
      },
      result: null,
    });
    expect(await getNoteById(fastify.sqlite, foreignNote.id)).toMatchObject({
      id: foreignNote.id,
      projectId: foreignProject.id,
      title: 'Foreign note',
    });
  });

  it('rejects ACP parent sessions from another project', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-boundary-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    fastify.decorate('acpRuntime', {
      cancelSession: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      createSession: vi.fn(async (input) => ({
        runtimeSessionId: `runtime-${input.provider}`,
        provider: input.provider,
      })),
      deleteSession: vi.fn(async () => undefined),
      isConfigured: vi.fn(() => true),
      isSessionActive: vi.fn(() => true),
      loadSession: vi.fn(async (input) => ({
        runtimeSessionId: input.runtimeSessionId,
        provider: input.provider,
      })),
      promptSession: vi.fn(async () => ({
        runtimeSessionId: 'runtime-boundary',
        response: {
          stopReason: 'end_turn' as const,
        },
      })),
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

    const ownerProject = await createProject(fastify.sqlite, {
      title: 'Owner Project',
      repoPath: '/tmp/team-ai-mcp-owner-project',
    });
    const foreignProject = await createProject(fastify.sqlite, {
      title: 'Foreign Project',
      repoPath: '/tmp/team-ai-mcp-foreign-project',
    });

    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-owner-project',
      id: 'acps_owner_root',
      projectId: ownerProject.id,
      provider: 'codex',
    });
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-foreign-project',
      id: 'acps_foreign_root',
      projectId: foreignProject.id,
      provider: 'codex',
    });

    const crossProjectResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-cross-project-parent',
        method: 'tools/call',
        params: {
          name: 'acp_session_create',
          arguments: {
            projectId: ownerProject.id,
            actorUserId: 'desktop-user',
            parentSessionId: 'acps_foreign_root',
            provider: 'codex',
          },
        },
      },
      'read-write',
    );

    expect(crossProjectResponse.statusCode).toBe(200);
    expect(crossProjectResponse.json()).toMatchObject({
      error: {
        code: -32000,
        data: {
          problem: {
            status: 409,
            title: 'MCP Project Boundary Violation',
            type: 'https://team-ai.dev/problems/mcp-project-boundary-violation',
          },
        },
        message: expect.stringContaining('acps_foreign_root'),
      },
      result: null,
    });
  });
});
