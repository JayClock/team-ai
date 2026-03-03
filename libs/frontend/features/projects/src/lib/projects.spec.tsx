import { act, render, screen } from '@testing-library/react';
import {
  useSuspenseResource,
  type UseSuspenseResourceResponse,
} from '@hateoas-ts/resource-react';
import { Signal } from '@preact/signals-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from '@shared/schema';
import { Entity, State } from '@hateoas-ts/resource';

import FeaturesProjects from './projects';

vi.mock('@hateoas-ts/resource-react', () => ({
  useSuspenseResource: vi.fn(),
}));

type MockResource = {
  rel: string;
};

type MockSuspenseResponse = UseSuspenseResourceResponse<Entity>;

function getMockRel(resource: unknown): string | null {
  if (typeof resource !== 'object' || resource === null || !('rel' in resource)) {
    return null;
  }
  const rel = (resource as MockResource).rel;
  return typeof rel === 'string' ? rel : null;
}

function toMockResponse(
  data: Record<string, unknown>,
  refresh: ReturnType<typeof vi.fn>,
  options?: { withPost?: boolean },
): MockSuspenseResponse {
  const { withPost = false } = options ?? {};
  return {
    data,
    resourceState: {
      collection: [{ data }],
    },
    resource: withPost ? { refresh, post: vi.fn() } : { refresh },
  } as unknown as MockSuspenseResponse;
}

function toEmptyMockResponse(): MockSuspenseResponse {
  return {
    data: {},
    resourceState: { collection: [] },
    resource: { refresh: vi.fn() },
  } as unknown as MockSuspenseResponse;
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly close = vi.fn();

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(eventName: string, callback: (event: MessageEvent) => void) {
    const existing = this.listeners.get(eventName) ?? [];
    existing.push(callback);
    this.listeners.set(eventName, existing);
  }

  emit(eventName: string, data?: { lastEventId?: string; data?: string }) {
    const payload = {
      lastEventId: data?.lastEventId ?? '',
      data: data?.data ?? '',
    } as unknown as MessageEvent;
    for (const callback of this.listeners.get(eventName) ?? []) {
      callback(payload);
    }
  }
}

describe('FeaturesProjects', () => {
  const mockedUseSuspenseResource = vi.mocked(useSuspenseResource);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should render successfully', () => {
    const { baseElement } = render(<FeaturesProjects />);
    expect(baseElement).toBeTruthy();
  });

  it('should dedupe repeated event ids and refresh once', async () => {
    const orchestrationRefresh = vi.fn().mockResolvedValue(undefined);
    const agentRefresh = vi.fn().mockResolvedValue(undefined);
    const taskRefresh = vi.fn().mockResolvedValue(undefined);
    const eventRefresh = vi.fn().mockResolvedValue(undefined);

    mockedUseSuspenseResource.mockImplementation((resource) => {
      const rel = getMockRel(resource);
      if (rel === 'orchestrations') {
        return toMockResponse(
          {
            id: 'session-1',
            state: 'RUNNING',
            startedAt: '2026-03-03T00:00:00Z',
            currentStep: null,
            failureReason: null,
          },
          orchestrationRefresh,
          { withPost: true },
        );
      }
      if (rel === 'agents') {
        return toMockResponse(
          { id: 'agent-1', name: 'Routa', role: 'ROUTA', status: 'ACTIVE' },
          agentRefresh,
        );
      }
      if (rel === 'tasks') {
        return toMockResponse(
          { id: 'task-1', title: 'Task', status: 'IN_PROGRESS' },
          taskRefresh,
        );
      }
      if (rel === 'events') {
        return toMockResponse(
          {
            id: 'event-1',
            type: 'TASK_ASSIGNED',
            occurredAt: '2026-03-03T00:00:00Z',
            agent: { id: 'agent-1' },
            message: 'assigned',
          },
          eventRefresh,
        );
      }
      return toEmptyMockResponse();
    });

    const projectState = {
      hasLink: (rel: string) =>
        ['orchestrations', 'agents', 'tasks', 'events', 'events-stream'].includes(rel),
      follow: (rel: string) => ({ rel }),
      getLink: (rel: string) =>
        rel === 'events-stream' ? { href: '/api/projects/p1/events/stream' } : undefined,
    } as unknown as State<Project>;

    render(
      <FeaturesProjects
        state={{ value: projectState } as Signal<State<Project>>}
      />,
    );

    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(1);
    const stream = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    expect(stream.url).toBe('/api/projects/p1/events/stream');

    await act(async () => {
      stream.onopen?.();
      stream.emit('agent-event', {
        lastEventId: 'event-2',
        data: JSON.stringify({ id: 'event-2', type: 'TASK_ASSIGNED' }),
      });
      stream.emit('agent-event', {
        lastEventId: 'event-2',
        data: JSON.stringify({ id: 'event-2', type: 'TASK_ASSIGNED' }),
      });
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(orchestrationRefresh).toHaveBeenCalledTimes(1);
    expect(agentRefresh).toHaveBeenCalledTimes(1);
    expect(taskRefresh).toHaveBeenCalledTimes(1);
    expect(eventRefresh).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Realtime')).toBeTruthy();
  });

  it('should reconnect stream with since cursor after disconnection', async () => {
    mockedUseSuspenseResource.mockImplementation((resource) => {
      const rel = getMockRel(resource);
      if (rel === 'orchestrations') {
        return toMockResponse(
          {
            id: 'session-1',
            state: 'RUNNING',
            startedAt: '2026-03-03T00:00:00Z',
            currentStep: null,
            failureReason: null,
          },
          vi.fn().mockResolvedValue(undefined),
          { withPost: true },
        );
      }
      if (rel === 'agents') {
        return toMockResponse(
          { id: 'agent-1', name: 'Agent', role: 'COORDINATOR', status: 'ACTIVE' },
          vi.fn().mockResolvedValue(undefined),
        );
      }
      if (rel === 'tasks') {
        return toMockResponse(
          { id: 'task-1', title: 'Task', status: 'IN_PROGRESS' },
          vi.fn().mockResolvedValue(undefined),
        );
      }
      if (rel === 'events') {
        return toMockResponse(
          {
            id: 'event-1',
            type: 'TASK_ASSIGNED',
            occurredAt: '2026-03-03T00:00:00Z',
            agent: { id: 'agent-1' },
            message: 'assigned',
          },
          vi.fn().mockResolvedValue(undefined),
        );
      }
      return toEmptyMockResponse();
    });

    const projectState = {
      hasLink: (rel: string) =>
        ['orchestrations', 'agents', 'tasks', 'events', 'events-stream'].includes(rel),
      follow: (rel: string) => ({ rel }),
      getLink: (rel: string) =>
        rel === 'events-stream' ? { href: '/api/projects/p1/events/stream' } : undefined,
    } as unknown as State<Project>;

    render(
      <FeaturesProjects
        state={{ value: projectState } as Signal<State<Project>>}
      />,
    );

    const initialStreamCount = FakeEventSource.instances.length;
    expect(initialStreamCount).toBeGreaterThanOrEqual(1);
    const firstStream = FakeEventSource.instances[initialStreamCount - 1];

    await act(async () => {
      firstStream.onopen?.();
      firstStream.emit('snapshot', {
        lastEventId: 'event-1',
        data: JSON.stringify({ latestEventId: 'event-1' }),
      });
      firstStream.onerror?.();
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    const resumedStreams = FakeEventSource.instances.filter((item) =>
      item.url.includes('/api/projects/p1/events/stream?since=event-1'),
    );
    expect(resumedStreams.length).toBeGreaterThanOrEqual(1);
  });
});
