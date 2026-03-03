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
  readonly listeners = new Map<string, Array<() => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly close = vi.fn();

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(eventName: string, callback: () => void) {
    const existing = this.listeners.get(eventName) ?? [];
    existing.push(callback);
    this.listeners.set(eventName, existing);
  }

  emit(eventName: string) {
    for (const callback of this.listeners.get(eventName) ?? []) {
      callback();
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

  it('should subscribe to events stream and refresh resources on realtime event', async () => {
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
            state: 'STARTED',
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
      stream.emit('agent-event');
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(orchestrationRefresh.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(agentRefresh.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(taskRefresh.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(eventRefresh.mock.calls.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Realtime')).toBeTruthy();
  });
});
