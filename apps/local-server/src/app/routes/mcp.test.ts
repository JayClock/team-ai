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
import { startTaskRun } from '../services/task-run-service';
import { createTask, listTasks, updateTask } from '../services/task-service';
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
    const baseHeaders = accessMode
      ? {
          accept: 'application/json, text/event-stream',
          'x-teamai-mcp-access-mode': accessMode,
        }
      : {
          accept: 'application/json, text/event-stream',
        };
    const initializeHeaders = baseHeaders;

    if (payload.method === 'initialize') {
      return fastify.inject({
        method: 'POST',
        url: '/api/mcp',
        headers: initializeHeaders,
        payload,
      });
    }

    const initializeResponse = await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: initializeHeaders,
      payload: {
        jsonrpc: '2.0',
        id: 'test-init',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'vitest',
            version: '0.0.0',
          },
        },
      },
    });

    const sessionId = initializeResponse.headers['mcp-session-id'];
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new Error(
        `Expected MCP initialize response to include mcp-session-id: ${JSON.stringify(
          {
            body: initializeResponse.body,
            headers: initializeResponse.headers,
            statusCode: initializeResponse.statusCode,
          },
        )}`,
      );
    }

    await fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        ...baseHeaders,
        'mcp-session-id': sessionId,
      },
      payload: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
    });

    return fastify.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        ...baseHeaders,
        'mcp-session-id': sessionId,
      },
      payload,
    });
  }

  function readMcpBody(response: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
    json(): Record<string, any>;
  }) {
    const contentType = response.headers['content-type'];
    const normalizedContentType = Array.isArray(contentType)
      ? contentType.join(', ')
      : (contentType ?? '');

    if (
      normalizedContentType.includes('text/event-stream') ||
      response.body.startsWith('event:')
    ) {
      const blocks = response.body
        .split('\n\n')
        .map((block) =>
          block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        )
        .filter((block) => block.length > 0);

      const lastBlock = blocks.at(-1);
      if (!lastBlock) {
        throw new Error('Expected SSE response to contain at least one data block');
      }

      return JSON.parse(lastBlock) as Record<string, any>;
    }

    return response.json();
  }

  function readMcpResult<T>(response: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
    json(): Record<string, any>;
  }) {
    const body = readMcpBody(response);
    if (body.result?.structuredContent) {
      return body.result.structuredContent as T;
    }

    const firstContent = body.result?.content?.[0];
    if (firstContent?.type === 'text') {
      return JSON.parse(firstContent.text) as T;
    }

    throw new Error('Expected MCP response to include structuredContent or text content');
  }

  function readMcpToolErrorText(response: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
    json(): Record<string, any>;
  }) {
    const body = readMcpBody(response);
    const text = body.result?.content?.[0]?.text;
    expect(body.result?.isError).toBe(true);
    expect(typeof text).toBe('string');
    return text as string;
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
    const explicitTask = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'Explicit MCP execute task',
      objective: 'Ensure explicit MCP execution still works',
      status: 'FAILED',
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
    const listedTools = readMcpBody(listToolsResponse).result.tools as Array<{
      annotations?: { readOnlyHint?: boolean };
      name: string;
    }>;
    expect(listedTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'projects_list',
        'agents_list',
        'read_agent_conversation',
        'tasks_list',
        'task_get',
        'task_update',
        'task_execute',
        'task_runs_list',
        'delegate_task_to_agent',
        'report_to_parent',
        'list_notes',
        'read_note',
        'set_note_content',
        'notes_append',
        'append_to_note',
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
    expect(
      readMcpResult<{ items: Array<{ id: string }> }>(listProjectsResponse).items[0]
        .id,
    ).toBe(project.id);

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
      readMcpResult<{ items: Array<Record<string, unknown>> }>(listAgentsResponse)
        .items[0],
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
      readMcpResult<{ items: Array<Record<string, unknown>> }>(listTasksResponse)
        .items[0],
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
    expect(readMcpResult<Record<string, unknown>>(getTaskResponse)).toMatchObject({
      task: {
        id: task.id,
        kind: 'implement',
        labels: ['mcp'],
        projectId: project.id,
      },
    });

    const note = await createNote(fastify.sqlite, {
      content: '# MCP Notes\n\nTrack orchestration state.',
      projectId: project.id,
      sessionId: rootSessionId,
      source: 'agent',
      title: 'Coordinator Log',
      type: 'general',
    });
    const insertHistoryEvent = fastify.sqlite.prepare(
      `
        INSERT INTO project_acp_session_events (
          event_id,
          session_id,
          type,
          payload_json,
          error_json,
          emitted_at,
          created_at
        )
        VALUES (
          @eventId,
          @sessionId,
          @type,
          @payloadJson,
          NULL,
          @emittedAt,
          @createdAt
        )
      `,
    );
    insertHistoryEvent.run({
      createdAt: '2026-03-16T09:00:00.000Z',
      emittedAt: '2026-03-16T09:00:00.000Z',
      eventId: 'acpe_hist_1',
      payloadJson: JSON.stringify({
        eventType: 'agent_message',
        message: {
          content: 'Scoped the MCP task workflow.',
          isChunk: false,
          role: 'assistant',
        },
        provider: 'codex',
        rawNotification: {},
        sessionId: rootSessionId,
        timestamp: '2026-03-16T09:00:00.000Z',
      }),
      sessionId: rootSessionId,
      type: 'agent_message',
    });
    insertHistoryEvent.run({
      createdAt: '2026-03-16T09:01:00.000Z',
      emittedAt: '2026-03-16T09:01:00.000Z',
      eventId: 'acpe_hist_2',
      payloadJson: JSON.stringify({
        eventType: 'tool_call',
        provider: 'codex',
        rawNotification: {},
        sessionId: rootSessionId,
        timestamp: '2026-03-16T09:01:00.000Z',
        toolCall: {
          input: {
            taskId: task.id,
          },
          inputFinalized: true,
          locations: [],
          output: {
            ok: true,
          },
          status: 'completed',
          title: 'delegate_task_to_agent',
          toolCallId: 'tool_1',
        },
      }),
      sessionId: rootSessionId,
      type: 'tool_call',
    });

    const listNotesResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-notes',
        method: 'tools/call',
        params: {
          name: 'list_notes',
          arguments: {
            projectId: project.id,
            sessionId: rootSessionId,
          },
        },
      },
      'read-write',
    );

    expect(listNotesResponse.statusCode).toBe(200);
    expect(
      readMcpResult<{ items: Array<Record<string, unknown>> }>(listNotesResponse)
        .items[0],
    ).toMatchObject({
      id: note.id,
      sessionId: rootSessionId,
      title: 'Coordinator Log',
      type: 'general',
    });

    const readNoteResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-note',
        method: 'tools/call',
        params: {
          name: 'read_note',
          arguments: {
            noteId: note.id,
            projectId: project.id,
          },
        },
      },
      'read-write',
    );

    expect(readNoteResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(readNoteResponse)).toMatchObject({
      note: {
        content: '# MCP Notes\n\nTrack orchestration state.',
        id: note.id,
        title: 'Coordinator Log',
      },
    });

    const readConversationResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-conversation',
        method: 'tools/call',
        params: {
          name: 'read_agent_conversation',
          arguments: {
            lastN: 10,
            projectId: project.id,
            sessionId: rootSessionId,
          },
        },
      },
      'read-write',
    );

    expect(readConversationResponse.statusCode).toBe(200);
    expect(
      readMcpResult<Record<string, unknown>>(readConversationResponse),
    ).toMatchObject({
      latest: {
        assistantMessage: 'Scoped the MCP task workflow.',
      },
      projection: {
        messages: [
          expect.objectContaining({
            role: 'assistant',
          }),
        ],
        toolCalls: [
          expect.objectContaining({
            status: 'completed',
            title: 'delegate_task_to_agent',
          }),
        ],
      },
      session: {
        id: rootSessionId,
        project: {
          id: project.id,
        },
      },
      totals: {
        eventCount: 2,
        messageCount: 1,
        toolCallCount: 1,
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
    expect(readMcpToolErrorText(invalidTaskGetResponse)).toContain('projectId');

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
    expect(readMcpResult<Record<string, unknown>>(taskUpdateResponse)).toMatchObject({
      task: {
        id: task.id,
        status: 'COMPLETED',
        completionSummary: 'ACP session completed',
        triggerSessionId: expect.stringMatching(/^acps_/),
      },
    });
    expect(promptMock).toHaveBeenCalledTimes(1);

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
    expect(readMcpToolErrorText(invalidTaskUpdateResponse)).toContain(
      'WAITING_RETRY',
    );

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
            taskId: completedTask.id,
          },
        },
      },
      'read-write',
    );

    expect(taskExecuteResponse.statusCode).toBe(200);
    expect(readMcpToolErrorText(taskExecuteResponse)).toContain('COMPLETED');

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
    expect(readMcpResult<Record<string, unknown>>(taskRunsResponse)).toMatchObject({
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

    const taskRunSessionId = readMcpResult<{ items: Array<{ sessionId: string }> }>(
      taskRunsResponse,
    ).items[0].sessionId;

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
    expect(readMcpResult<Record<string, unknown>>(appendNoteResponse)).toMatchObject({
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

    const createdNoteId = readMcpResult<{ note: { id: string } }>(
      appendNoteResponse,
    ).note.id;
    expect(await getNoteById(fastify.sqlite, createdNoteId)).toMatchObject({
      id: createdNoteId,
      linkedTaskId: task.id,
      sessionId: taskRunSessionId,
      title: 'Review Summary',
    });

    const explicitTaskExecuteResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-task-execute-explicit',
        method: 'tools/call',
        params: {
          name: 'task_execute',
          arguments: {
            projectId: project.id,
            taskId: explicitTask.id,
          },
        },
      },
      'read-write',
    );

    expect(explicitTaskExecuteResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(explicitTaskExecuteResponse))
      .toMatchObject({
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
          id: explicitTask.id,
          status: 'COMPLETED',
        },
      });
    expect(promptMock).toHaveBeenCalledTimes(2);

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
    const acpSessionId = readMcpResult<{ session: { id: string } }>(
      createAcpResponse,
    ).session.id;
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
    expect(promptMock).toHaveBeenCalledTimes(3);
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
    const toolNames = readMcpBody(listToolsResponse).result.tools.map(
      (tool: { name: string }) => tool.name,
    );
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'projects_list',
        'agents_list',
        'read_agent_conversation',
        'tasks_list',
        'task_get',
        'task_runs_list',
        'list_notes',
        'read_note',
      ]),
    );
    expect(toolNames).not.toContain('task_update');
    expect(toolNames).not.toContain('task_execute');
    expect(toolNames).not.toContain('delegate_task_to_agent');
    expect(toolNames).not.toContain('report_to_parent');
    expect(toolNames).not.toContain('set_note_content');
    expect(toolNames).not.toContain('notes_append');
    expect(toolNames).not.toContain('append_to_note');
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
    expect(readMcpToolErrorText(deniedWriteResponse)).toContain(
      'Tool task_update not found',
    );
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
    expect(readMcpToolErrorText(response)).toContain('WAITING_RETRY');
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

  it('sets canonical spec note content and syncs task blocks idempotently', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-spec-sync-${Date.now()}`;

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
        runtimeSessionId: 'runtime-spec-sync',
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
      title: 'Spec Sync Project',
      repoPath: '/tmp/team-ai-mcp-spec-sync-project',
    });
    const rootSessionId = 'acps_spec_sync_root';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-spec-sync-project',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const initialContent = `
## Goal
Ship a routa-style workflow.

@@@task
# Implement spec sync
Build the first spec-to-task sync path.

## Scope
apps/local-server sync path

## Definition of Done
- Spec notes create tasks
- Task sync is idempotent

## Verification
- npx vitest run apps/local-server/src/app/routes/mcp.test.ts
@@@

@@@task
# Review spec sync
Verify the generated tasks and note state.

## Scope
Validation and review logic

## Definition of Done
- Review output is persisted

## Verification
- npx vitest run apps/local-server/src/app/services/spec-task-sync-service.test.ts
@@@
`;

    const firstResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-set-spec-first',
        method: 'tools/call',
        params: {
          name: 'set_note_content',
          arguments: {
            content: initialContent,
            projectId: project.id,
            sessionId: rootSessionId,
            title: 'Execution Spec',
            type: 'spec',
          },
        },
      },
      'read-write',
    );

    expect(firstResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(firstResponse)).toMatchObject({
      note: {
        projectId: project.id,
        sessionId: rootSessionId,
        title: 'Execution Spec',
        type: 'spec',
      },
      taskSync: {
        createdCount: 2,
        parsedCount: 2,
        skippedCount: 0,
        updatedCount: 0,
      },
    });

    const firstPayload = readMcpResult<{
      note: { id: string };
      taskSync: { tasks: Array<{ taskId: string }> };
    }>(firstResponse);
    const firstTaskIds = firstPayload.taskSync.tasks.map((task) => task.taskId);

    const updatedContent = `
## Goal
Ship a routa-style workflow.

@@@task
# Implement canonical spec sync
Build the first spec-to-task sync path with canonical note updates.

## Scope
apps/local-server sync path

## Definition of Done
- Spec notes create tasks
- Task sync is idempotent

## Verification
- npx vitest run apps/local-server/src/app/routes/mcp.test.ts
@@@

@@@task
# Review spec sync
Verify the generated tasks and note state.

## Scope
Validation and review logic

## Definition of Done
- Review output is persisted

## Verification
- npx vitest run apps/local-server/src/app/services/spec-task-sync-service.test.ts
@@@
`;

    const secondResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-set-spec-second',
        method: 'tools/call',
        params: {
          name: 'set_note_content',
          arguments: {
            content: updatedContent,
            projectId: project.id,
            sessionId: rootSessionId,
            type: 'spec',
          },
        },
      },
      'read-write',
    );

    expect(secondResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(secondResponse)).toMatchObject({
      note: {
        id: firstPayload.note.id,
        projectId: project.id,
        sessionId: rootSessionId,
        type: 'spec',
      },
      taskSync: {
        createdCount: 0,
        parsedCount: 2,
        skippedCount: 0,
        updatedCount: 2,
      },
    });

    const syncedTasks = await listTasks(fastify.sqlite, {
      page: 1,
      pageSize: 20,
      projectId: project.id,
      sessionId: rootSessionId,
    });

    expect(syncedTasks.total).toBe(2);
    expect(syncedTasks.items.map((task) => task.id).sort()).toEqual(
      firstTaskIds.sort(),
    );
    expect(syncedTasks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'implement',
          title: 'Implement canonical spec sync',
        }),
        expect.objectContaining({
          kind: 'review',
          title: 'Review spec sync',
        }),
      ]),
    );
  });

  it('delegates a task to a downstream specialist via MCP', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-delegate-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);

    const promptMock = vi.fn(async () => ({
      runtimeSessionId: 'runtime-delegate',
      response: {
        stopReason: 'end_turn' as const,
      },
    }));

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
      title: 'Delegate Task Project',
      repoPath: '/tmp/team-ai-mcp-delegate-project',
    });
    const callerSessionId = 'acps_delegate_root';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-delegate-project',
      id: callerSessionId,
      projectId: project.id,
      provider: 'codex',
    });
    const task = await createTask(fastify.sqlite, {
      projectId: project.id,
      title: 'Implement delegated feature',
      objective: 'Delegate this task to the built-in crafter specialist',
      status: 'PENDING',
      kind: 'implement',
      sessionId: callerSessionId,
    });

    const response = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-delegate-task',
        method: 'tools/call',
        params: {
          name: 'delegate_task_to_agent',
          arguments: {
            callerSessionId,
            projectId: project.id,
            specialist: 'CRAFTER',
            taskId: task.id,
            waitMode: 'after_all',
          },
        },
      },
      'read-write',
    );

    expect(response.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(response)).toMatchObject({
      delegation: {
        groupId: expect.any(String),
        parentWillResumeWhen: {
          condition: 'after_delegation_group_settled',
          groupId: expect.any(String),
          pendingTaskCount: 0,
          taskIds: [task.id],
          waitMode: 'after_all',
        },
        requestedSpecialist: 'CRAFTER',
        resolvedRole: 'CRAFTER',
        resolvedSpecialist: {
          id: 'crafter-implementor',
          name: 'Crafter Implementor',
        },
        waitMode: 'after_all',
        waveState: {
          completedCount: 1,
          failureCount: 0,
          groupId: expect.any(String),
          pendingCount: 0,
          settled: true,
          status: 'COMPLETED',
          taskIds: [task.id],
          totalCount: 1,
          waveId: expect.any(String),
          waveKind: 'implement',
        },
      },
      task: {
        id: task.id,
        assignedRole: 'CRAFTER',
        assignedSpecialistId: 'crafter-implementor',
        status: 'COMPLETED',
      },
    });
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it('reports child session outcomes back into task, note, and run state via MCP', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-report-${Date.now()}`;

    const fastify = Fastify();
    fastifyInstances.push(fastify);
    const promptSessionMock = vi.fn(async () => ({
      runtimeSessionId: 'runtime-report',
      response: {
        stopReason: 'end_turn' as const,
      },
    }));

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
      promptSession: promptSessionMock,
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
      title: 'Report Task Project',
      repoPath: '/tmp/team-ai-mcp-report-project',
    });
    const rootSessionId = 'acps_report_root';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-report-project',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const implementationTask = await createTask(fastify.sqlite, {
      kind: 'implement',
      objective: 'Capture crafter completion summaries',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'READY',
      title: 'Implement report flow',
    });
    const followUpGateTask = await createTask(fastify.sqlite, {
      dependencies: [implementationTask.id],
      kind: 'verify',
      objective: 'Auto-dispatch gate after crafter completion',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'PENDING',
      title: 'Auto verify report flow',
    });
    const implementationSessionId = 'acps_report_impl_child';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-report-project',
      id: implementationSessionId,
      parentSessionId: rootSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: implementationTask.id,
    });
    await updateTask(fastify.sqlite, implementationTask.id, {
      assignedRole: 'CRAFTER',
      executionSessionId: implementationSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(fastify.sqlite, {
      projectId: project.id,
      role: 'CRAFTER',
      sessionId: implementationSessionId,
      status: 'RUNNING',
      taskId: implementationTask.id,
    });

    const implementationResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-impl',
        method: 'tools/call',
        params: {
          name: 'report_to_parent',
          arguments: {
            projectId: project.id,
            sessionId: implementationSessionId,
            summary: 'Implemented the downstream report flow',
            verdict: 'completed',
            filesChanged: ['apps/local-server/src/app/routes/mcp.ts'],
            verificationPerformed: ['npx nx test local-server --runTestsByPath mcp'],
          },
        },
      },
      'read-write',
    );

    expect(implementationResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(implementationResponse)).toMatchObject({
      autoHandoff: [
        expect.objectContaining({
          dispatched: true,
          taskId: followUpGateTask.id,
          title: 'Auto verify report flow',
        }),
      ],
      noteAction: 'created',
      note: {
        linkedTaskId: implementationTask.id,
        sessionId: rootSessionId,
        title: 'Task Report: Implement report flow',
        type: 'task',
      },
      report: {
        mode: 'implementation',
        parentSessionId: rootSessionId,
        taskId: implementationTask.id,
        verdict: 'completed',
      },
      task: {
        completionSummary: 'Implemented the downstream report flow',
        executionSessionId: null,
        resultSessionId: implementationSessionId,
        status: 'COMPLETED',
      },
      taskRun: {
        sessionId: implementationSessionId,
        status: 'COMPLETED',
        summary: 'Implemented the downstream report flow',
      },
      wake: {
        delivered: true,
        mode: 'immediate',
        reason: null,
      },
    });
    expect(promptSessionMock).toHaveBeenCalled();

    const parentConversationResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-parent-conversation',
        method: 'tools/call',
        params: {
          name: 'read_agent_conversation',
          arguments: {
            projectId: project.id,
            sessionId: rootSessionId,
          },
        },
      },
      'read-write',
    );

    expect(parentConversationResponse.statusCode).toBe(200);
    expect(
      readMcpResult<Record<string, unknown>>(parentConversationResponse),
    ).toMatchObject({
      projection: {
        orchestrationEvents: expect.arrayContaining([
          expect.objectContaining({
            eventName: 'gate_required',
            parentSessionId: rootSessionId,
            taskId: implementationTask.id,
          }),
          expect.objectContaining({
            eventName: 'parent_session_resume_requested',
            parentSessionId: rootSessionId,
            taskId: implementationTask.id,
            wakeDelivered: true,
          }),
        ]),
      },
      totals: {
        orchestrationEventCount: 2,
      },
    });

    const childConversationResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-child-conversation',
        method: 'tools/call',
        params: {
          name: 'read_agent_conversation',
          arguments: {
            projectId: project.id,
            sessionId: implementationSessionId,
          },
        },
      },
      'read-write',
    );

    expect(childConversationResponse.statusCode).toBe(200);
    expect(
      readMcpResult<Record<string, unknown>>(childConversationResponse),
    ).toMatchObject({
      projection: {
        orchestrationEvents: [
          expect.objectContaining({
            childSessionId: implementationSessionId,
            eventName: 'child_session_completed',
            parentSessionId: rootSessionId,
            taskId: implementationTask.id,
          }),
        ],
      },
      totals: {
        orchestrationEventCount: 1,
      },
    });

    const verificationTask = await createTask(fastify.sqlite, {
      kind: 'verify',
      objective: 'Capture gate approval states',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'READY',
      title: 'Verify report flow',
    });
    const verificationSessionId = 'acps_report_gate_child';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-report-project',
      id: verificationSessionId,
      parentSessionId: rootSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: verificationTask.id,
    });
    await updateTask(fastify.sqlite, verificationTask.id, {
      assignedRole: 'GATE',
      executionSessionId: verificationSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(fastify.sqlite, {
      projectId: project.id,
      role: 'GATE',
      sessionId: verificationSessionId,
      status: 'RUNNING',
      taskId: verificationTask.id,
    });

    const gatePassResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-gate-pass',
        method: 'tools/call',
        params: {
          name: 'report_to_parent',
          arguments: {
            projectId: project.id,
            sessionId: verificationSessionId,
            summary: 'Gate approved the report flow',
            verdict: 'pass',
            verificationPerformed: ['npx nx test local-server --runTestsByPath task-report-service'],
          },
        },
      },
      'read-write',
    );

    expect(gatePassResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(gatePassResponse)).toMatchObject({
      note: {
        linkedTaskId: verificationTask.id,
        sessionId: rootSessionId,
        title: 'Verification Report: Verify report flow',
        type: 'general',
      },
      report: {
        mode: 'verification',
        parentSessionId: rootSessionId,
        taskId: verificationTask.id,
        verdict: 'pass',
      },
      task: {
        resultSessionId: verificationSessionId,
        status: 'COMPLETED',
        verificationVerdict: 'pass',
      },
      taskRun: {
        sessionId: verificationSessionId,
        status: 'COMPLETED',
        verificationVerdict: 'pass',
      },
      wake: {
        delivered: true,
        mode: 'immediate',
        reason: null,
      },
    });

    const duplicateGatePassResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-gate-pass-duplicate',
        method: 'tools/call',
        params: {
          name: 'report_to_parent',
          arguments: {
            projectId: project.id,
            sessionId: verificationSessionId,
            summary: 'Gate approved the report flow again',
            verdict: 'pass',
          },
        },
      },
      'read-write',
    );

    expect(duplicateGatePassResponse.statusCode).toBe(200);
    expect(
      readMcpResult<Record<string, unknown>>(duplicateGatePassResponse),
    ).toMatchObject({
      wake: {
        delivered: false,
        mode: 'immediate',
        reason: 'resume_already_requested',
      },
    });

    const failingTask = await createTask(fastify.sqlite, {
      kind: 'review',
      objective: 'Make gate failures retryable',
      projectId: project.id,
      sessionId: rootSessionId,
      status: 'READY',
      title: 'Reject report flow',
    });
    const failingSessionId = 'acps_report_gate_fail_child';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-report-project',
      id: failingSessionId,
      parentSessionId: rootSessionId,
      projectId: project.id,
      provider: 'codex',
      taskId: failingTask.id,
    });
    await updateTask(fastify.sqlite, failingTask.id, {
      assignedRole: 'GATE',
      executionSessionId: failingSessionId,
      status: 'RUNNING',
    });
    await startTaskRun(fastify.sqlite, {
      projectId: project.id,
      role: 'GATE',
      sessionId: failingSessionId,
      status: 'RUNNING',
      taskId: failingTask.id,
    });

    const gateFailResponse = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-gate-fail',
        method: 'tools/call',
        params: {
          name: 'report_to_parent',
          arguments: {
            projectId: project.id,
            sessionId: failingSessionId,
            summary: 'Gate rejected the report flow',
            verdict: 'fail',
            blocker: 'Regression remains in MCP route handling',
          },
        },
      },
      'read-write',
    );

    expect(gateFailResponse.statusCode).toBe(200);
    expect(readMcpResult<Record<string, unknown>>(gateFailResponse)).toMatchObject({
      report: {
        mode: 'verification',
        parentSessionId: rootSessionId,
        taskId: failingTask.id,
        verdict: 'fail',
      },
      task: {
        resultSessionId: failingSessionId,
        status: 'WAITING_RETRY',
        verificationVerdict: 'fail',
      },
      taskRun: {
        sessionId: failingSessionId,
        status: 'FAILED',
        verificationVerdict: 'fail',
      },
      wake: {
        delivered: true,
        mode: 'immediate',
        reason: null,
      },
    });
  });

  it('rejects report_to_parent without a valid child session context', async () => {
    process.env.TEAMAI_DATA_DIR = `/tmp/team-ai-mcp-report-invalid-${Date.now()}`;

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
        runtimeSessionId: 'runtime-report-invalid',
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
      title: 'Invalid Report Task Project',
      repoPath: '/tmp/team-ai-mcp-report-invalid-project',
    });
    const rootSessionId = 'acps_report_invalid_root';
    insertAcpSession(fastify.sqlite, {
      cwd: '/tmp/team-ai-mcp-report-invalid-project',
      id: rootSessionId,
      projectId: project.id,
      provider: 'codex',
    });

    const response = await callMcp(
      fastify,
      {
        jsonrpc: '2.0',
        id: 'mcp-report-invalid',
        method: 'tools/call',
        params: {
          name: 'report_to_parent',
          arguments: {
            projectId: project.id,
            sessionId: rootSessionId,
            summary: 'This should not be accepted',
            verdict: 'completed',
          },
        },
      },
      'read-write',
    );

    expect(response.statusCode).toBe(200);
    expect(readMcpToolErrorText(response)).toContain(
      'delegated child session with a bound task',
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
    expect(readMcpToolErrorText(crossProjectTaskResponse)).toContain(
      foreignTask.id,
    );

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
    expect(readMcpToolErrorText(crossProjectRunsResponse)).toContain(
      'acps_scope_foreign_root',
    );

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
    expect(readMcpToolErrorText(crossProjectNoteResponse)).toContain(
      foreignNote.id,
    );
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
    expect(readMcpToolErrorText(crossProjectResponse)).toContain(
      'acps_foreign_root',
    );
  });
});
