import { State } from '@hateoas-ts/resource';
import { Project, RoleValue, Specialist } from '@shared/schema';
import type { ProjectRuntimeProfile } from '@shared/schema/lib/runtime-profile';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import {
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  SparklesIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { shouldResetComposerModelOnProviderChange } from '../session/session-composer-model';
import {
  resolveWorkbenchRuntimeRoleDefault,
  type WorkbenchSessionRuntimeProfile,
  workbenchRuntimeRoles,
} from '../session/session-runtime-profile';
import { useAcpProviderModels } from '../session/use-acp-provider-models';
import { useAcpProviders } from '../session/use-acp-providers';
import { ProjectAgentInstallPanel } from './project-agent-install-panel';
import { ProjectModelPicker } from './project-model-picker';
import { ProjectProviderPicker } from './project-provider-picker';

type SettingsTab = 'providers' | 'agents' | 'specialists';

type RuntimeProfileResponse = {
  orchestrationMode: WorkbenchSessionRuntimeProfile['orchestrationMode'];
  roleDefaults: WorkbenchSessionRuntimeProfile['roleDefaults'];
};

export type ProjectSettingsDialogProps = {
  initialTab?: SettingsTab;
  onOpenChange: (open: boolean) => void;
  onRuntimeProfileChange?: (
    profile: WorkbenchSessionRuntimeProfile | null,
  ) => void;
  open: boolean;
  projectState: State<Project>;
};

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toWorkbenchRuntimeProfile(
  payload: RuntimeProfileResponse,
): WorkbenchSessionRuntimeProfile {
  return {
    orchestrationMode: payload.orchestrationMode,
    roleDefaults: payload.roleDefaults ?? {},
  };
}

function describeModelState(input: {
  draftProviderId: string | null;
  error: string | null;
  loading: boolean;
  modelCount: number;
}): string {
  if (!input.draftProviderId) {
    return '先设置默认 provider。新的 ACP 会话会优先继承它，composer 仍可按次覆盖。';
  }

  if (input.loading) {
    return '正在读取该 provider 的 model 列表...';
  }

  if (input.error) {
    return input.error;
  }

  if (input.modelCount === 0) {
    return '当前 provider 没有返回可选 model。保存后，新会话将不携带显式 model。';
  }

  return '默认 model 只会显示当前 provider 可用的选项；切换 provider 会自动清空旧 model。';
}

const roleMetadata: Record<
  RoleValue,
  {
    accentClass: string;
    description: string;
    title: string;
  }
> = {
  ROUTA: {
    accentClass:
      'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    description: '负责根会话协调与计划分发。',
    title: 'Coordinator',
  },
  CRAFTER: {
    accentClass:
      'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    description: '负责实现类任务和代码落地。',
    title: 'Crafter',
  },
  GATE: {
    accentClass:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    description: '负责 review / verify 闭环。',
    title: 'Gate',
  },
  DEVELOPER: {
    accentClass:
      'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
    description: '负责单人 developer 模式下的根会话。',
    title: 'Developer',
  },
};

function normalizeRoleDefaults(
  roleDefaults: WorkbenchSessionRuntimeProfile['roleDefaults'] | null | undefined,
): WorkbenchSessionRuntimeProfile['roleDefaults'] {
  return Object.fromEntries(
    workbenchRuntimeRoles.flatMap((role) => {
      const roleDefault = resolveWorkbenchRuntimeRoleDefault(roleDefaults, role);

      return roleDefault ? [[role, roleDefault]] : [];
    }),
  ) as WorkbenchSessionRuntimeProfile['roleDefaults'];
}

function serializeRoleDefaults(
  roleDefaults: WorkbenchSessionRuntimeProfile['roleDefaults'] | null | undefined,
): string {
  return JSON.stringify(normalizeRoleDefaults(roleDefaults));
}

function specialistScopeLabel(scope: Specialist['data']['source']['scope']) {
  switch (scope) {
    case 'builtin':
      return 'Built-in';
    case 'workspace':
      return 'Workspace';
    case 'user':
      return 'User';
    case 'library':
      return 'Library';
    default:
      return scope;
  }
}

function specialistRoleClass(role: string) {
  switch (role) {
    case 'ROUTA':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
    case 'CRAFTER':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
    case 'GATE':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
    case 'DEVELOPER':
      return 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

function RoleProviderRow(props: {
  disabled: boolean;
  onChange: (
    nextValue: { model: string | null; providerId: string | null } | null,
  ) => void;
  providers: ReturnType<typeof useAcpProviders>['providers'];
  providersLoading: boolean;
  role: RoleValue;
  value: { model: string | null; providerId: string | null } | null;
}) {
  const { disabled, onChange, providers, providersLoading, role, value } = props;
  const providerId = normalizeOptionalText(value?.providerId);
  const model = normalizeOptionalText(value?.model);
  const metadata = roleMetadata[role];
  const {
    error: providerModelsError,
    loading: providerModelsLoading,
    models: providerModels,
  } = useAcpProviderModels(providerId);

  const helperText = useMemo(
    () =>
      describeModelState({
        draftProviderId: providerId,
        error: providerModelsError,
        loading: providerModelsLoading,
        modelCount: providerModels.length,
      }),
    [providerId, providerModelsError, providerModelsLoading, providerModels],
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 xl:max-w-72">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${metadata.accentClass}`}>
              {role}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {metadata.title}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {metadata.description}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 xl:items-end">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <ProjectProviderPicker
              allowClear
              disabled={disabled}
              emptyLabel={`未配置 ${role} provider`}
              loading={providersLoading}
              onValueChange={(nextProviderId) => {
                const shouldResetModel = shouldResetComposerModelOnProviderChange(
                  {
                    nextProviderId,
                    previousProviderId: providerId,
                  },
                );

                onChange(
                  nextProviderId || model || value
                    ? {
                        model: shouldResetModel ? null : model,
                        providerId: nextProviderId,
                      }
                    : null,
                );
              }}
              providers={providers}
              value={providerId}
            />
            <ProjectModelPicker
              disabled={disabled}
              error={providerModelsError}
              loading={providerModelsLoading}
              models={providerModels}
              onValueChange={(nextModel) => {
                onChange(
                  providerId || nextModel || value
                    ? {
                        model: nextModel,
                        providerId,
                      }
                    : null,
                );
              }}
              providerId={providerId}
              value={model}
            />
          </div>

          <div
            className={`rounded-xl border px-3 py-2 text-xs leading-5 xl:max-w-[36rem] ${
              providerModelsError
                ? 'border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                : 'border-border/60 bg-muted/20 text-muted-foreground'
            }`}
          >
            {helperText}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvidersTab(props: {
  onRuntimeProfileChange?: (
    profile: WorkbenchSessionRuntimeProfile | null,
  ) => void;
  projectId: string;
  providersState: ReturnType<typeof useAcpProviders>;
  runtimeProfile: WorkbenchSessionRuntimeProfile | null;
  runtimeProfileLoading: boolean;
  setRuntimeProfile: (profile: WorkbenchSessionRuntimeProfile | null) => void;
}) {
  const {
    onRuntimeProfileChange,
    projectId,
    providersState,
    runtimeProfile,
    runtimeProfileLoading,
    setRuntimeProfile,
  } = props;
  const { loading: providersLoading, providers } = providersState;
  const [draftRoleDefaults, setDraftRoleDefaults] = useState<
    WorkbenchSessionRuntimeProfile['roleDefaults']
  >(normalizeRoleDefaults(runtimeProfile?.roleDefaults));
  const [savePending, setSavePending] = useState(false);
  const currentRoleDefaults = normalizeRoleDefaults(runtimeProfile?.roleDefaults);
  const isDirty =
    serializeRoleDefaults(currentRoleDefaults) !==
    serializeRoleDefaults(draftRoleDefaults);
  const availableProviderCount = providers.filter(
    (provider) => provider.status === 'available',
  ).length;
  const configuredRoleCount = workbenchRuntimeRoles.filter((role) =>
    Boolean(resolveWorkbenchRuntimeRoleDefault(draftRoleDefaults, role)),
  ).length;

  useEffect(() => {
    setDraftRoleDefaults(normalizeRoleDefaults(runtimeProfile?.roleDefaults));
  }, [runtimeProfile?.roleDefaults]);

  const handleSave = useCallback(() => {
    if (savePending) {
      return;
    }

    setSavePending(true);

    void runtimeFetch(`/api/projects/${projectId}/runtime-profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roleDefaults: draftRoleDefaults,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string;
            title?: string;
          } | null;
          throw new Error(
            payload?.detail ?? payload?.title ?? '更新默认 provider 失败',
          );
        }

        const payload = (await response.json()) as RuntimeProfileResponse;
        const nextProfile = toWorkbenchRuntimeProfile(payload);
        setRuntimeProfile(nextProfile);
        onRuntimeProfileChange?.(nextProfile);
        toast.success('已更新角色 provider / model');
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : '更新角色 provider 失败',
        );
      })
      .finally(() => {
        setSavePending(false);
      });
  }, [
    draftRoleDefaults,
    onRuntimeProfileChange,
    projectId,
    savePending,
    setRuntimeProfile,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Providers</div>
                <p className="text-xs leading-5 text-muted-foreground">
                  参考 routa 的设置方式，按角色管理 provider 与 model，而不是单一默认值。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                  可用 provider {availableProviderCount}
                </span>
                <span className="rounded-full border border-border/60 bg-background px-2 py-1">
                  已配置角色 {configuredRoleCount} / {workbenchRuntimeRoles.length}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Active Mode
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {runtimeProfile?.orchestrationMode ?? 'ROUTA'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                根会话会读取当前模式对应角色的 provider。
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Save Scope
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                Role Defaults
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                保存后会同时影响根会话和任务角色派发。
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Provider Catalog
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {providers.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                安装和刷新入口在 Agents tab。
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {workbenchRuntimeRoles.map((role) => (
              <RoleProviderRow
                key={role}
                disabled={runtimeProfileLoading || savePending}
                onChange={(nextValue) => {
                  setDraftRoleDefaults((current: WorkbenchSessionRuntimeProfile['roleDefaults']) => {
                    const next = { ...current };

                    if (!nextValue || (!nextValue.providerId && !nextValue.model)) {
                      delete next[role];
                      return next;
                    }

                    next[role] = {
                      model: normalizeOptionalText(nextValue.model),
                      providerId: normalizeOptionalText(nextValue.providerId),
                    };
                    return next;
                  });
                }}
                providers={providers}
                providersLoading={providersLoading}
                role={role}
                value={resolveWorkbenchRuntimeRoleDefault(draftRoleDefaults, role)}
              />
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-border/60 px-5 py-4">
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            disabled={runtimeProfileLoading || savePending || !isDirty}
            onClick={handleSave}
            className="h-8 rounded-lg px-3 text-xs"
          >
            {savePending ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            保存角色配置
          </Button>
        </div>
      </div>
    </div>
  );
}

function SpecialistsTab(props: {
  loading: boolean;
  onReload: () => void;
  projectId: string;
  specialists: State<Specialist>[];
}) {
  const { loading, onReload, projectId, specialists } = props;
  const [draftId, setDraftId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState<RoleValue>('ROUTA');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftModelTier, setDraftModelTier] = useState('');
  const [draftDefaultAdapter, setDraftDefaultAdapter] = useState('');
  const [draftRoleReminder, setDraftRoleReminder] = useState('');
  const [draftSystemPrompt, setDraftSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string | null>(null);

  const resetDraft = useCallback(() => {
    setSelectedSpecialistId(null);
    setDraftId('');
    setDraftName('');
    setDraftRole('ROUTA');
    setDraftDescription('');
    setDraftModelTier('');
    setDraftDefaultAdapter('');
    setDraftRoleReminder('');
    setDraftSystemPrompt('');
  }, []);

  const loadIntoDraft = useCallback((specialist: Specialist['data']) => {
    setSelectedSpecialistId(specialist.id);
    setDraftId(specialist.id);
    setDraftName(specialist.name);
    setDraftRole(specialist.role);
    setDraftDescription(specialist.description ?? '');
    setDraftModelTier(specialist.modelTier ?? '');
    setDraftDefaultAdapter(specialist.defaultAdapter ?? '');
    setDraftRoleReminder(specialist.roleReminder ?? '');
    setDraftSystemPrompt(specialist.systemPrompt);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draftId.trim() || !draftName.trim() || !draftSystemPrompt.trim()) {
      toast.error('请填写 specialist id、name 和 system prompt。');
      return;
    }

    setSaving(true);

    try {
      const existing = specialists.find((item) => item.data.id === draftId.trim());
      const method = selectedSpecialistId ? 'PATCH' : 'POST';
      const url =
        method === 'POST'
          ? `/api/projects/${projectId}/specialists`
          : `/api/projects/${projectId}/specialists/${draftId.trim()}`;

      const response = await runtimeFetch(url, {
        body: JSON.stringify({
          defaultAdapter: normalizeOptionalText(draftDefaultAdapter),
          description: normalizeOptionalText(draftDescription),
          ...(method === 'POST' ? { id: draftId.trim() } : {}),
          modelTier: normalizeOptionalText(draftModelTier),
          name: draftName.trim(),
          role: draftRole,
          roleReminder: normalizeOptionalText(draftRoleReminder),
          systemPrompt: draftSystemPrompt.trim(),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method,
      });
      if (!response.ok) {
        throw new Error(`保存 specialist 失败: ${response.status}`);
      }

      toast.success(
        existing && existing.data.source.scope !== 'user'
          ? '已创建 user override specialist'
          : 'Specialist 已保存',
      );
      resetDraft();
      onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存 specialist 失败');
    } finally {
      setSaving(false);
    }
  }, [
    draftDefaultAdapter,
    draftDescription,
    draftId,
    draftModelTier,
    draftName,
    draftRole,
    draftRoleReminder,
    draftSystemPrompt,
    onReload,
    projectId,
    resetDraft,
    selectedSpecialistId,
    specialists,
  ]);

  const handleDelete = useCallback(async (specialistId: string) => {
    setSaving(true);

    try {
      const response = await runtimeFetch(
        `/api/projects/${projectId}/specialists/${specialistId}`,
        {
          method: 'DELETE',
        },
      );
      if (!response.ok) {
        throw new Error(`删除 specialist 失败: ${response.status}`);
      }

      toast.success('Specialist 已删除');
      if (selectedSpecialistId === specialistId) {
        resetDraft();
      }
      onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除 specialist 失败');
    } finally {
      setSaving(false);
    }
  }, [onReload, projectId, resetDraft, selectedSpecialistId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <div className="text-sm font-semibold">Specialists</div>
          <p className="mt-1 text-xs text-muted-foreground">
            先做 routa 风格的 specialist 面板，当前展示项目可见的 specialist 列表。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReload}
          disabled={loading}
          className="h-8 rounded-lg px-3 text-xs"
        >
          <RefreshCwIcon
            className={`size-4 ${loading ? 'animate-spin' : ''}`}
          />
          刷新
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 px-5 py-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border/60 bg-background p-4">
            <div className="text-sm font-semibold">Custom Specialist</div>
            <p className="mt-1 text-xs text-muted-foreground">
              可以创建新的 user specialist，或基于现有 builtin/workspace specialist 创建 override。
            </p>

            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">ID</span>
                <Input value={draftId} onChange={(event) => setDraftId(event.target.value)} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Role</span>
                <select
                  className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
                  value={draftRole}
                  onChange={(event) => setDraftRole(event.target.value as RoleValue)}
                >
                  <option value="ROUTA">ROUTA</option>
                  <option value="CRAFTER">CRAFTER</option>
                  <option value="GATE">GATE</option>
                  <option value="DEVELOPER">DEVELOPER</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Description</span>
                <Input
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Model Tier</span>
                  <Input
                    value={draftModelTier}
                    onChange={(event) => setDraftModelTier(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Default Adapter</span>
                  <Input
                    value={draftDefaultAdapter}
                    onChange={(event) => setDraftDefaultAdapter(event.target.value)}
                  />
                </label>
              </div>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Role Reminder</span>
                <Input
                  value={draftRoleReminder}
                  onChange={(event) => setDraftRoleReminder(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">System Prompt</span>
                <Textarea
                  className="min-h-40"
                  value={draftSystemPrompt}
                  onChange={(event) => setDraftSystemPrompt(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
                {selectedSpecialistId ? 'Save Override' : 'Create Specialist'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={resetDraft}>
                Reset
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {loading && specialists.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                正在加载 specialists...
              </div>
            ) : specialists.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                当前项目没有可见 specialists。
              </div>
            ) : (
              specialists.map((specialist) => (
                <div
                  key={specialist.data.id}
                  className="rounded-2xl border border-border/60 bg-background p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">
                          {specialist.data.name}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${specialistRoleClass(
                            specialist.data.role,
                          )}`}
                        >
                          {specialist.data.role}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {specialistScopeLabel(specialist.data.source.scope)}
                        </span>
                        {specialist.data.modelTier ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                            {specialist.data.modelTier}
                          </span>
                        ) : null}
                      </div>
                      {specialist.data.description ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {specialist.data.description}
                        </p>
                      ) : null}
                      {specialist.data.source.scope !== 'user' ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          编辑会创建同 id 的 user override。
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      {specialist.data.defaultAdapter ? (
                        <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1">
                          adapter {specialist.data.defaultAdapter}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 font-mono">
                        {specialist.data.id}
                      </span>
                    </div>
                  </div>

                  {specialist.data.roleReminder ? (
                    <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {specialist.data.roleReminder}
                    </div>
                  ) : null}

                  <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <SparklesIcon className="size-3.5" />
                      System Prompt Preview
                    </div>
                    <pre className="line-clamp-6 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                      {specialist.data.systemPrompt}
                    </pre>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => loadIntoDraft(specialist.data)}
                    >
                      {specialist.data.source.scope === 'user' ? 'Edit' : 'Override'}
                    </Button>
                    {specialist.data.source.scope === 'user' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void handleDelete(specialist.data.id)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function ProjectSettingsDialog(props: ProjectSettingsDialogProps) {
  const {
    initialTab = 'providers',
    onOpenChange,
    onRuntimeProfileChange,
    open,
    projectState,
  } = props;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [runtimeProfile, setRuntimeProfile] =
    useState<WorkbenchSessionRuntimeProfile | null>(null);
  const [runtimeProfileLoading, setRuntimeProfileLoading] = useState(false);
  const [specialists, setSpecialists] = useState<State<Specialist>[]>([]);
  const [specialistsLoading, setSpecialistsLoading] = useState(false);
  const providersState = useAcpProviders();

  const loadRuntimeProfile = useCallback(async () => {
    setRuntimeProfileLoading(true);

    try {
      const profileState =
        (await projectState.follow('runtime-profile').get()) as State<ProjectRuntimeProfile>;
      setRuntimeProfile({
        orchestrationMode: profileState.data.orchestrationMode,
        roleDefaults: profileState.data.roleDefaults,
      });
    } catch {
      setRuntimeProfile(null);
    } finally {
      setRuntimeProfileLoading(false);
    }
  }, [projectState]);

  const loadSpecialists = useCallback(async () => {
    setSpecialistsLoading(true);

    try {
      const specialistsState = await projectState.follow('specialists').refresh();
      setSpecialists(specialistsState.collection as State<Specialist>[]);
    } catch (error) {
      setSpecialists([]);
      toast.error(
        error instanceof Error ? error.message : '加载 specialists 失败',
      );
    } finally {
      setSpecialistsLoading(false);
    }
  }, [projectState]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTab(initialTab);
    void loadRuntimeProfile();
    void loadSpecialists();
  }, [initialTab, loadRuntimeProfile, loadSpecialists, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(860px,calc(100vh-2rem))] min-h-0 w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Settings2Icon className="size-4 text-slate-500" />
                Settings
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                参考 routa 的设置面板，先收敛为 Providers / Agents /
                Specialists 三块。
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border/60 px-5 py-3">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-slate-100/80 p-1 dark:bg-[#1f2233]">
              <TabsTrigger value="providers" className="rounded-lg text-xs">
                Providers
              </TabsTrigger>
              <TabsTrigger value="agents" className="rounded-lg text-xs">
                Agents
              </TabsTrigger>
              <TabsTrigger value="specialists" className="rounded-lg text-xs">
                Specialists
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="providers" className="mt-0 min-h-0 flex-1">
            <ProvidersTab
              onRuntimeProfileChange={onRuntimeProfileChange}
              projectId={projectState.data.id}
              providersState={providersState}
              runtimeProfile={runtimeProfile}
              runtimeProfileLoading={runtimeProfileLoading}
              setRuntimeProfile={setRuntimeProfile}
            />
          </TabsContent>

          <TabsContent value="agents" className="mt-0 min-h-0 flex-1">
            <ProjectAgentInstallPanel
              installingProviderId={providersState.installingProviderId}
              loading={providersState.loading}
              onInstall={providersState.install}
              onReload={providersState.reload}
              platform={
                typeof navigator !== 'undefined' ? navigator.platform : null
              }
              providers={providersState.providers}
              registryError={providersState.registryError}
              runtimeAvailability={{ npx: true, uvx: true }}
            />
          </TabsContent>

          <TabsContent value="specialists" className="mt-0 min-h-0 flex-1">
            <SpecialistsTab
              loading={specialistsLoading}
              onReload={() => void loadSpecialists()}
              projectId={projectState.data.id}
              specialists={specialists}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-border/60 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
