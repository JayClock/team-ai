import { State } from '@hateoas-ts/resource';
import { AcpSessionSummary, Project } from '@shared/schema';
import {
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
} from '@shared/ui';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareTextIcon,
  SparklesIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildSessionTree,
  findSessionPathIds,
  SessionTreeNode,
  sessionDisplayName,
} from './session-tree';
import {
  describeSessionStatus,
  formatSessionStatusLabel,
  sessionStatusChipClasses,
  sessionStatusTone,
} from './session-status';
import { useProjectSessions } from './use-project-sessions';

function sessionRoleLabel(
  session: State<AcpSessionSummary>,
): string {
  const specialistId = session.data.specialistId?.trim().toLowerCase();
  if (!specialistId) {
    return 'ROUTA';
  }
  if (specialistId.includes('developer')) {
    return 'DEVELOPER';
  }
  if (specialistId.includes('gate')) {
    return 'GATE';
  }
  if (specialistId.includes('crafter')) {
    return 'CRAFTER';
  }
  if (specialistId.includes('routa')) {
    return 'ROUTA';
  }
  return specialistId.toUpperCase();
}

export function SessionList(props: {
  onSelect: (session: State<AcpSessionSummary>) => void;
  projectState: State<Project>;
  selectedSessionId?: string;
  sessionAnnotationsById?: Record<string, string[]>;
  sessions?: State<AcpSessionSummary>[];
  sessionsLoading?: boolean;
}) {
  const {
    onSelect,
    projectState,
    selectedSessionId,
    sessionAnnotationsById,
    sessions,
    sessionsLoading,
  } = props;
  const shouldLoadInternally =
    sessions === undefined && sessionsLoading === undefined;
  const {
    error,
    loading: internalLoading,
    sessions: internalSessions,
  } = useProjectSessions(projectState, {
    enabled: shouldLoadInternally,
  });
  const resolvedSessions = sessions ?? internalSessions;
  const loading = sessionsLoading ?? internalLoading;
  const sessionTree = useMemo(
    () => buildSessionTree(resolvedSessions),
    [resolvedSessions],
  );
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const selectedPathIds = useMemo(
    () => findSessionPathIds(sessionTree, selectedSessionId),
    [selectedSessionId, sessionTree],
  );
  const selectedPathSet = useMemo(
    () => new Set(selectedPathIds),
    [selectedPathIds],
  );
  const expandedIdSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  const toggleSessionBranch = (sessionId: string) => {
    setExpandedIds((current) =>
      current.includes(sessionId)
        ? current.filter((value) => value !== sessionId)
        : [...current, sessionId],
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden h-full">
      <div className="border-b px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          会话
        </p>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-2 p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">正在加载会话...</p>
          ) : error && sessionTree.length === 0 ? (
            <p className="text-sm text-destructive">
              {error.message || '加载会话列表失败'}
            </p>
          ) : sessionTree.length === 0 ? (
            <Empty className="border-dashed px-4 py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareTextIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有会话</EmptyTitle>
                <EmptyDescription>
                  点击顶部"新建会话"开始第一个会话。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            sessionTree.map((node) => (
              <SessionTreeItem
                key={node.session.data.id}
                depth={0}
                expandedIdSet={expandedIdSet}
                node={node}
                onSelect={onSelect}
                onToggle={toggleSessionBranch}
                sessionAnnotationsById={sessionAnnotationsById}
                selectedPathSet={selectedPathSet}
                selectedSessionId={selectedSessionId}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SessionTreeItem(props: {
  depth: number;
  expandedIdSet: Set<string>;
  node: SessionTreeNode;
  onSelect: (session: State<AcpSessionSummary>) => void;
  onToggle: (sessionId: string) => void;
  sessionAnnotationsById?: Record<string, string[]>;
  selectedPathSet: Set<string>;
  selectedSessionId?: string;
}) {
  const {
    depth,
    expandedIdSet,
    node,
    onSelect,
    onToggle,
    sessionAnnotationsById,
    selectedPathSet,
    selectedSessionId,
  } = props;
  const sessionId = node.session.data.id;
  const active = sessionId === selectedSessionId;
  const containsSelected = selectedPathSet.has(sessionId);
  const hasChildren = node.children.length > 0;
  const isExpanded =
    hasChildren && (expandedIdSet.has(sessionId) || containsSelected);
  const isChildSession = depth > 0;
  const roleLabel = sessionRoleLabel(node.session);
  const sessionAnnotations = sessionAnnotationsById?.[sessionId] ?? [];
  const specialistId = node.session.data.specialistId?.trim() || null;
  const sessionTaskId = node.session.data.task?.id ?? null;
  const delegationGroupId = node.session.data.delegationGroupId?.trim() || null;
  const waveId = node.session.data.waveId?.trim() || null;
  const sessionStatus = formatSessionStatusLabel(node.session.data);
  const sessionStatusDescription = describeSessionStatus(node.session.data);

  return (
    <div className="space-y-2">
      <Card
        className={`overflow-hidden rounded-2xl border shadow-none transition ${
          active
            ? 'border-primary/50 bg-primary/5'
            : containsSelected
              ? 'border-border/90 bg-muted/30'
              : 'border-border/70 bg-background/90 hover:border-border'
        }`}
      >
        <CardContent className="p-0">
          <div className="flex items-start gap-1.5 px-2.5 py-2">
            {hasChildren ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-0.5 h-7 w-7 shrink-0 rounded-lg text-muted-foreground"
                onClick={() => onToggle(sessionId)}
                aria-label={isExpanded ? '收起子会话' : '展开子会话'}
              >
                {isExpanded ? (
                  <ChevronDownIcon className="size-4" />
                ) : (
                  <ChevronRightIcon className="size-4" />
                )}
              </Button>
            ) : (
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  depth === 0
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-border/60 bg-muted/30 text-muted-foreground'
                }`}
              >
                {depth === 0 ? (
                  <SparklesIcon className="size-3.5" />
                ) : (
                  <MessageSquareTextIcon className="size-3.5" />
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="w-full min-w-0 text-left"
                onClick={() => onSelect(node.session)}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <div className="truncate text-[13px] font-medium leading-5 text-foreground">
                      {sessionDisplayName(node.session)}
                    </div>
                    {isChildSession ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-700">
                        Child
                      </span>
                    ) : null}
                    {active ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-primary">
                        当前
                      </span>
                    ) : null}
                    {containsSelected && !active ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Focus
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-4 text-muted-foreground">
                    <span className="font-mono">
                      {node.session.data.provider ?? 'opencode'}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="font-mono">{roleLabel}</span>
                    <span aria-hidden="true">•</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1 ${sessionStatusChipClasses(node.session.data)}`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${sessionStatusTone(node.session.data)}`}
                      />
                      {sessionStatus}
                    </span>
                  </div>
                  {sessionStatusDescription ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {sessionStatusDescription}
                    </p>
                  ) : null}
                  {specialistId ? (
                    <div className="mt-1 break-all font-mono text-[10px] leading-4 text-muted-foreground">
                      {specialistId}
                    </div>
                  ) : null}
                  {sessionTaskId || delegationGroupId || waveId ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sessionTaskId ? (
                        <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                          task {sessionTaskId}
                        </span>
                      ) : null}
                      {delegationGroupId ? (
                        <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                          {delegationGroupId}
                        </span>
                      ) : null}
                      {waveId ? (
                        <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                          {waveId}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {sessionAnnotations.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sessionAnnotations.map((annotation) => (
                        <span
                          key={`${sessionId}-${annotation}`}
                          className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          {annotation}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
      {hasChildren && isExpanded ? (
        <div className="ml-4 border-l border-border/60 pl-4">
          <div className="space-y-2">
            {node.children.map((child) => (
              <SessionTreeItem
                key={child.session.data.id}
                depth={depth + 1}
                expandedIdSet={expandedIdSet}
                node={child}
                onSelect={onSelect}
                onToggle={onToggle}
                sessionAnnotationsById={sessionAnnotationsById}
                selectedPathSet={selectedPathSet}
                selectedSessionId={selectedSessionId}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
