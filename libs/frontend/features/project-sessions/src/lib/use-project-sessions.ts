import { State } from '@hateoas-ts/resource';
import { AcpSessionCollection, AcpSessionSummary, Project } from '@shared/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';

function timestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function loadSessionPages(
  initialPage: State<AcpSessionCollection>,
): Promise<State<AcpSessionSummary>[]> {
  const allSessions = [...initialPage.collection];
  let currentPage = initialPage;

  while (currentPage.hasLink('next')) {
    currentPage = await currentPage.follow('next').get();
    allSessions.push(...currentPage.collection);
  }

  return allSessions;
}

export function useProjectSessions(
  projectState: State<Project>,
  options: {
    enabled?: boolean;
  } = {},
) {
  const { enabled = true } = options;
  const sessionsResource = useMemo(
    () => projectState.follow('acp-sessions'),
    [projectState],
  );
  const [sessions, setSessions] = useState<State<AcpSessionSummary>[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return [];
    }

    setLoading(true);

    try {
      const currentPage = await sessionsResource.refresh();
      const allSessions = await loadSessionPages(currentPage);

      allSessions.sort((left, right) => {
        const leftValue = timestamp(
          left.data.lastActivityAt ??
            left.data.startedAt ??
            left.data.completedAt,
        );
        const rightValue = timestamp(
          right.data.lastActivityAt ??
            right.data.startedAt ??
            right.data.completedAt,
        );
        return rightValue - leftValue;
      });

      setSessions(allSessions);
      setError(null);

      return allSessions;
    } catch (nextError) {
      const resolvedError =
        nextError instanceof Error
          ? nextError
          : new Error('加载会话列表失败');
      setError(resolvedError);
      throw resolvedError;
    } finally {
      setLoading(false);
    }
  }, [enabled, sessionsResource]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    void refresh().catch(() => undefined);
  }, [enabled, refresh]);

  return {
    error,
    loading,
    refresh,
    sessions,
    sessionsResource,
  };
}
