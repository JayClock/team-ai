import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentGatewayClient } from '../clients/agent-gateway-client';
import { initializeDatabase } from '../db/sqlite';
import { OrchestrationStreamBroker } from '../plugins/orchestration-stream';
import problemJsonPlugin from '../plugins/problem-json';
import sensiblePlugin from '../plugins/sensible';
import { createProject } from '../services/project-service';
import projectSessionsRoute from './project-sessions';
import sessionsRoute from './sessions';

describe('sessions routes', () => {
  const cleanupTasks: Array<() => Promise<void>> = [];
  const fastifyInstances: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    while (fastifyInstances.length > 0) {
      const fastify = fastifyInstances.pop();
      if (fastify) {
        await fastify.close();
      }
    }

    while (cleanupTasks.length > 0) {
      const cleanup = cleanupTasks.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('creates orchestration sessions and exposes detail, steps, and events routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Desktop Project',
      repoPath: '/tmp/team-ai-desktop-project',
    });

    const createResponse = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/sessions`,
      payload: {
        goal: 'Promote local-server as the desktop-first runtime',
        title: 'Promote desktop runtime',
        cwd: '/tmp/team-ai-desktop-project',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.headers.location).toMatch(/^\/api\/sessions\/orc_/);

    const createdSession = createResponse.json();
    expect(createdSession).toMatchObject({
      projectId: project.id,
      status: 'PENDING',
      title: 'Promote desktop runtime',
      cwd: '/tmp/team-ai-desktop-project',
      _links: {
        self: {
          href: createResponse.headers.location,
        },
        collection: {
          href: `/api/projects/${project.id}/sessions`,
        },
        events: {
          href: `/api/sessions/${createdSession.id}/events`,
        },
        steps: {
          href: `/api/sessions/${createdSession.id}/steps`,
        },
      },
    });

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: createResponse.headers.location ?? `/api/sessions/${createdSession.id}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: createdSession.id,
      projectId: project.id,
      status: 'PENDING',
      title: 'Promote desktop runtime',
    });

    const stepsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${createdSession.id}/steps`,
    });

    expect(stepsResponse.statusCode).toBe(200);
    expect(stepsResponse.json()._embedded.steps).toHaveLength(3);
    expect(
      stepsResponse
        .json()
        ._embedded.steps.map((step: { kind: string }) => step.kind),
    ).toEqual(['PLAN', 'IMPLEMENT', 'VERIFY']);

    const eventsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${createdSession.id}/events`,
    });

    expect(eventsResponse.statusCode).toBe(200);
    expect(eventsResponse.json()).toMatchObject({
      _links: {
        self: {
          href: `/api/sessions/${createdSession.id}/events`,
        },
        session: {
          href: `/api/sessions/${createdSession.id}`,
        },
      },
    });
    expect(
      eventsResponse
        .json()
        ._embedded.events.map((event: { type: string }) => event.type),
    ).toContain('session.created');
  });

  it('lists orchestration sessions from project and global entrypoints', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const projectA = await createProject(sqlite, {
      title: 'Desktop Runtime',
      repoPath: '/tmp/team-ai-project-a',
    });
    const projectB = await createProject(sqlite, {
      title: 'Agent Gateway',
      repoPath: '/tmp/team-ai-project-b',
    });

    await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectA.id}/sessions`,
      payload: {
        goal: 'Create desktop-first orchestration home',
        title: 'Desktop-first session',
      },
    });
    await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectB.id}/sessions`,
      payload: {
        goal: 'Stabilize ACP boundary',
        title: 'ACP stabilization',
      },
    });

    const projectSessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/projects/${projectA.id}/sessions`,
    });

    expect(projectSessionsResponse.statusCode).toBe(200);
    expect(projectSessionsResponse.json()).toMatchObject({
      _links: {
        self: {
          href: `/api/projects/${projectA.id}/sessions?page=1&pageSize=20`,
        },
      },
      total: 1,
    });
    expect(projectSessionsResponse.json()._embedded.sessions).toHaveLength(1);
    expect(projectSessionsResponse.json()._embedded.sessions[0]).toMatchObject({
      projectId: projectA.id,
      title: 'Desktop-first session',
    });

    const globalSessionsResponse = await fastify.inject({
      method: 'GET',
      url: '/api/sessions',
    });

    expect(globalSessionsResponse.statusCode).toBe(200);
    expect(globalSessionsResponse.json()).toMatchObject({
      _links: {
        self: {
          href: '/api/sessions?page=1&pageSize=20',
        },
      },
      total: 2,
    });
    expect(globalSessionsResponse.json()._embedded.sessions).toHaveLength(2);

    const filteredSessionsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions?projectId=${projectB.id}`,
    });

    expect(filteredSessionsResponse.statusCode).toBe(200);
    expect(filteredSessionsResponse.json()).toMatchObject({
      total: 1,
      _embedded: {
        sessions: [
          expect.objectContaining({
            projectId: projectB.id,
            title: 'ACP stabilization',
          }),
        ],
      },
    });
  });

  it('cancels and resumes orchestration sessions through session control routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Session Controls',
      repoPath: '/tmp/team-ai-controls',
    });
    const sessionId = await createSession(fastify, project.id, {
      goal: 'Cancel and resume a desktop session',
      title: 'Session controls',
    });

    const cancelResponse = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({
      id: sessionId,
      status: 'CANCELLED',
    });

    const cancelledStepsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/steps`,
    });

    expect(cancelledStepsResponse.statusCode).toBe(200);
    expect(
      cancelledStepsResponse
        .json()
        ._embedded.steps.every((step: { status: string }) => step.status === 'CANCELLED'),
    ).toBe(true);

    const resumeResponse = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/resume`,
    });

    expect(resumeResponse.statusCode).toBe(200);
    expect(resumeResponse.json()).toMatchObject({
      id: sessionId,
      status: 'RUNNING',
    });

    const resumedStepsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/steps`,
    });

    expect(resumedStepsResponse.statusCode).toBe(200);
    expect(
      resumedStepsResponse
        .json()
        ._embedded.steps.every((step: { status: string }) => step.status === 'PENDING'),
    ).toBe(true);

    const eventsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/events`,
    });

    expect(eventsResponse.statusCode).toBe(200);
    expect(
      eventsResponse
        .json()
        ._embedded.events.map((event: { type: string }) => event.type),
    ).toEqual(
      expect.arrayContaining(['session.created', 'session.cancelled', 'session.resumed']),
    );
  });

  it('retries failed orchestration sessions and resets failed steps', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Retry Session',
      repoPath: '/tmp/team-ai-retry',
    });
    const sessionId = await createSession(fastify, project.id, {
      goal: 'Retry a failed orchestration session',
      title: 'Retry controls',
    });

    const failedStepId = markSessionStepFailed(sqlite, sessionId, 'IMPLEMENT');

    const retryResponse = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/retry`,
    });

    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toMatchObject({
      id: sessionId,
      status: 'RUNNING',
    });

    const stepsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/steps`,
    });

    expect(stepsResponse.statusCode).toBe(200);
    expect(stepsResponse.json()._embedded.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempt: 2,
          errorCode: null,
          errorMessage: null,
          id: failedStepId,
          kind: 'IMPLEMENT',
          status: 'READY',
        }),
      ]),
    );

    const eventsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/events`,
    });

    expect(eventsResponse.statusCode).toBe(200);
    expect(
      eventsResponse
        .json()
        ._embedded.events.map((event: { type: string }) => event.type),
    ).toEqual(
      expect.arrayContaining(['session.created', 'session.retried', 'step.retried']),
    );
  });

  it('exposes step detail and retries failed steps through step routes', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Step Controls',
      repoPath: '/tmp/team-ai-step-controls',
    });
    const sessionId = await createSession(fastify, project.id, {
      goal: 'Retry a failed orchestration step',
      title: 'Step retry controls',
    });

    const failedStepId = markSessionStepFailed(sqlite, sessionId, 'VERIFY');

    const detailResponse = await fastify.inject({
      method: 'GET',
      url: `/api/steps/${failedStepId}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: failedStepId,
      sessionId,
      kind: 'VERIFY',
      status: 'FAILED',
      _links: {
        self: {
          href: `/api/steps/${failedStepId}`,
        },
        events: {
          href: `/api/steps/${failedStepId}/events`,
        },
        retry: {
          href: `/api/steps/${failedStepId}/retry`,
        },
        session: {
          href: `/api/sessions/${sessionId}`,
        },
      },
    });

    const eventsResponse = await fastify.inject({
      method: 'GET',
      url: `/api/steps/${failedStepId}/events`,
    });

    expect(eventsResponse.statusCode).toBe(200);
    expect(eventsResponse.json()).toMatchObject({
      _links: {
        self: {
          href: `/api/steps/${failedStepId}/events`,
        },
        session: {
          href: `/api/sessions/${sessionId}`,
        },
      },
    });
    expect(
      eventsResponse
        .json()
        ._embedded.events.map((event: { type: string }) => event.type),
    ).toContain('step.failed');

    const retryResponse = await fastify.inject({
      method: 'POST',
      url: `/api/steps/${failedStepId}/retry`,
    });

    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toMatchObject({
      id: failedStepId,
      sessionId,
      kind: 'VERIFY',
      status: 'READY',
      attempt: 2,
      errorCode: null,
      errorMessage: null,
    });

    const sessionResponse = await fastify.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toMatchObject({
      id: sessionId,
      status: 'RUNNING',
    });
  });

  it('returns 404 for missing sessions and steps', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);

    const missingSessionResponse = await fastify.inject({
      method: 'GET',
      url: '/api/sessions/orc_missing',
    });

    expect(missingSessionResponse.statusCode).toBe(404);
    expect(missingSessionResponse.json()).toMatchObject({
      type: 'https://team-ai.dev/problems/orchestration-session-not-found',
      title: 'Orchestration Session Not Found',
      status: 404,
      instance: '/api/sessions/orc_missing',
    });

    const missingStepResponse = await fastify.inject({
      method: 'GET',
      url: '/api/steps/step_missing',
    });

    expect(missingStepResponse.statusCode).toBe(404);
    expect(missingStepResponse.json()).toMatchObject({
      type: 'https://team-ai.dev/problems/orchestration-step-not-found',
      title: 'Orchestration Step Not Found',
      status: 404,
      instance: '/api/steps/step_missing',
    });
  });

  it('returns 409 when retrying sessions or steps from invalid states', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'Invalid State Checks',
      repoPath: '/tmp/team-ai-invalid-states',
    });
    const sessionId = await createSession(fastify, project.id, {
      goal: 'Exercise invalid orchestration transitions',
      title: 'Invalid transitions',
    });
    const stepId = getSessionStepId(sqlite, sessionId, 'PLAN');

    const retrySessionResponse = await fastify.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/retry`,
    });

    expect(retrySessionResponse.statusCode).toBe(409);
    expect(retrySessionResponse.json()).toMatchObject({
      type: 'https://team-ai.dev/problems/orchestration-invalid-state',
      title: 'Invalid Orchestration State',
      status: 409,
      instance: `/api/sessions/${sessionId}/retry`,
    });

    const retryStepResponse = await fastify.inject({
      method: 'POST',
      url: `/api/steps/${stepId}/retry`,
    });

    expect(retryStepResponse.statusCode).toBe(409);
    expect(retryStepResponse.json()).toMatchObject({
      type: 'https://team-ai.dev/problems/orchestration-invalid-state',
      title: 'Invalid Orchestration State',
      status: 409,
      instance: `/api/steps/${stepId}/retry`,
    });
  });

  it('streams orchestration session events over sse', async () => {
    const sqlite = await createTestDatabase();
    const fastify = await createTestServer(sqlite);
    const project = await createProject(sqlite, {
      title: 'SSE Session',
      repoPath: '/tmp/team-ai-sse',
    });
    const sessionId = await createSession(fastify, project.id, {
      goal: 'Observe orchestration session stream',
      title: 'SSE stream',
    });

    await fastify.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const response = await fetch(
      `${urlFor(fastify.server)}/api/sessions/${sessionId}/stream`,
      {
        signal: controller.signal,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    if (!response.body) {
      throw new Error('Expected SSE response body to be present');
    }

    const reader = response.body.getReader();

    const connectedChunk = await readSseChunk(reader);
    expect(connectedChunk).toContain('event: connected');
    expect(connectedChunk).toContain(`"sessionId":"${sessionId}"`);

    fastify.orchestrationStreamBroker.publish({
      at: new Date().toISOString(),
      id: `evt_stream_${sessionId}`,
      payload: {
        source: 'test',
      },
      sessionId,
      type: 'session.running',
    });

    const eventChunk = await readSseChunk(reader);
    expect(eventChunk).toContain('event: session.running');
    expect(eventChunk).toContain(`"sessionId":"${sessionId}"`);
    expect(eventChunk).toContain('"source":"test"');

    controller.abort();
  });

  async function createTestDatabase(): Promise<Database> {
    const dataDir = await mkdtemp(join(tmpdir(), 'team-ai-sessions-route-'));
    const previousDataDir = process.env.TEAMAI_DATA_DIR;

    process.env.TEAMAI_DATA_DIR = dataDir;
    const sqlite = initializeDatabase();

    cleanupTasks.push(async () => {
      sqlite.close();
      if (previousDataDir === undefined) {
        delete process.env.TEAMAI_DATA_DIR;
      } else {
        process.env.TEAMAI_DATA_DIR = previousDataDir;
      }
      await rm(dataDir, { recursive: true, force: true });
    });

    return sqlite;
  }

  async function createTestServer(sqlite: Database) {
    const fastify = Fastify();
    fastifyInstances.push(fastify);
    fastify.decorate('sqlite', sqlite);
    fastify.decorate(
      'agentGatewayClient',
      {
        cancel: vi.fn(),
        createSession: vi.fn(),
        health: vi.fn(),
        isConfigured: vi.fn(() => false),
        listEvents: vi.fn(),
        prompt: vi.fn(),
        stream: vi.fn(),
      } satisfies AgentGatewayClient,
    );
    fastify.decorate(
      'orchestrationStreamBroker',
      new OrchestrationStreamBroker(),
    );

    await fastify.register(problemJsonPlugin);
    await fastify.register(sensiblePlugin);
    await fastify.register(projectSessionsRoute, { prefix: '/api' });
    await fastify.register(sessionsRoute, { prefix: '/api' });
    await fastify.ready();

    return fastify;
  }

  async function createSession(
    fastify: ReturnType<typeof Fastify>,
    projectId: string,
    payload: {
      goal: string;
      title: string;
      cwd?: string;
    },
  ) {
    const response = await fastify.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/sessions`,
      payload,
    });

    expect(response.statusCode).toBe(201);

    return (response.json() as { id: string }).id;
  }

  function markSessionStepFailed(
    sqlite: Database,
    sessionId: string,
    kind: 'PLAN' | 'IMPLEMENT' | 'VERIFY',
  ) {
    const failedAt = new Date().toISOString();
    const failedStep = sqlite
      .prepare(
        `
          SELECT id, attempt
          FROM orchestration_steps
          WHERE session_id = ? AND kind = ?
          LIMIT 1
        `,
      )
      .get(sessionId, kind) as { attempt: number; id: string } | undefined;

    if (!failedStep) {
      throw new Error(`Failed to locate ${kind} step for session ${sessionId}`);
    }

    sqlite
      .prepare(
        `
          UPDATE orchestration_sessions
          SET
            status = 'FAILED',
            updated_at = ?
          WHERE id = ?
        `,
      )
      .run(failedAt, sessionId);

    sqlite
      .prepare(
        `
          UPDATE orchestration_steps
          SET
            status = 'FAILED',
            error_code = 'TEST_STEP_FAILED',
            error_message = 'Simulated step failure',
            completed_at = ?,
            updated_at = ?
          WHERE id = ?
        `,
      )
      .run(failedAt, failedAt, failedStep.id);

    sqlite
      .prepare(
        `
          INSERT INTO orchestration_events (
            id,
            session_id,
            step_id,
            type,
            payload_json,
            at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        `evt_failed_${failedStep.id}`,
        sessionId,
        failedStep.id,
        'step.failed',
        JSON.stringify({
          attempt: failedStep.attempt,
          errorCode: 'TEST_STEP_FAILED',
          errorMessage: 'Simulated step failure',
          kind,
        }),
        failedAt,
      );

    return failedStep.id;
  }

  function getSessionStepId(
    sqlite: Database,
    sessionId: string,
    kind: 'PLAN' | 'IMPLEMENT' | 'VERIFY',
  ) {
    const step = sqlite
      .prepare(
        `
          SELECT id
          FROM orchestration_steps
          WHERE session_id = ? AND kind = ?
          LIMIT 1
        `,
      )
      .get(sessionId, kind) as { id: string } | undefined;

    if (!step) {
      throw new Error(`Failed to locate ${kind} step for session ${sessionId}`);
    }

    return step.id;
  }

  async function readSseChunk(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ) {
    const timeout = setTimeout;

    return await new Promise<string>((resolve, reject) => {
      const timer = timeout(() => {
        reject(new Error('Timed out while waiting for SSE chunk'));
      }, 3_000);

      void reader
        .read()
        .then(({ done, value }) => {
          clearTimeout(timer);

          if (done || !value) {
            reject(new Error('SSE stream closed before yielding a chunk'));
            return;
          }

          resolve(new TextDecoder().decode(value));
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  function urlFor(server: ReturnType<typeof Fastify>['server']) {
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }
});
