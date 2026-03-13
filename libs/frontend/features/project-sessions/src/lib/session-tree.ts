import { State } from '@hateoas-ts/resource';
import { AcpSession, AcpSessionSummary } from '@shared/schema';

export type SessionTreeNode = {
  children: SessionTreeNode[];
  session: State<AcpSessionSummary>;
};

export function sessionDisplayName(
  session: State<AcpSessionSummary> | State<AcpSession>,
): string {
  const name = session.data.name?.trim();
  if (name) {
    return name;
  }
  return `会话 ${session.data.id}`;
}

export function buildSessionTree(
  sessions: State<AcpSessionSummary>[],
): SessionTreeNode[] {
  const childMap = new Map<string, State<AcpSessionSummary>[]>();
  const roots: State<AcpSessionSummary>[] = [];
  const allIds = new Set(sessions.map((session) => session.data.id));

  for (const session of sessions) {
    const parentId = session.data.parentSession?.id;
    if (!parentId || !allIds.has(parentId)) {
      roots.push(session);
      continue;
    }
    const children = childMap.get(parentId) ?? [];
    children.push(session);
    childMap.set(parentId, children);
  }

  const sortSessions = (items: State<AcpSessionSummary>[]) =>
    [...items].sort((left, right) => {
      const leftValue = Date.parse(
        left.data.lastActivityAt ??
          left.data.startedAt ??
          left.data.completedAt ??
          '',
      );
      const rightValue = Date.parse(
        right.data.lastActivityAt ??
          right.data.startedAt ??
          right.data.completedAt ??
          '',
      );
      return (
        (Number.isNaN(rightValue) ? 0 : rightValue) -
        (Number.isNaN(leftValue) ? 0 : leftValue)
      );
    });

  const hydrate = (session: State<AcpSessionSummary>): SessionTreeNode => ({
    session,
    children: sortSessions(childMap.get(session.data.id) ?? []).map(hydrate),
  });

  return sortSessions(roots).map(hydrate);
}

export function countSessionTree(node: SessionTreeNode): number {
  return (
    1 +
    node.children.reduce((count, child) => count + countSessionTree(child), 0)
  );
}

export function findSessionPathIds(
  nodes: SessionTreeNode[],
  sessionId?: string,
): string[] {
  if (!sessionId) {
    return [];
  }

  for (const node of nodes) {
    if (node.session.data.id === sessionId) {
      return [node.session.data.id];
    }

    const childPath = findSessionPathIds(node.children, sessionId);
    if (childPath.length > 0) {
      return [node.session.data.id, ...childPath];
    }
  }

  return [];
}
