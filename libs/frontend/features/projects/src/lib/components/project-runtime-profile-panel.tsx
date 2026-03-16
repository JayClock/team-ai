import { toast } from '@shared/ui';
import { Button, Card, CardContent } from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { LoaderCircleIcon, SaveIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { shouldResetComposerModelOnProviderChange } from '../session/session-composer-model';
import type { WorkbenchSessionRuntimeProfile } from '../session/session-runtime-profile';
import { useAcpProviderModels } from '../session/use-acp-provider-models';
import { useAcpProviders } from '../session/use-acp-providers';
import { ProjectModelPicker } from './project-model-picker';
import { ProjectProviderPicker } from './project-provider-picker';

type RuntimeProfileResponse = {
  defaultModel: string | null;
  defaultProviderId: string | null;
  orchestrationMode: WorkbenchSessionRuntimeProfile['orchestrationMode'];
};

export type ProjectRuntimeProfilePanelProps = {
  onRuntimeProfileChange?: (
    profile: WorkbenchSessionRuntimeProfile | null,
  ) => void;
  projectId: string;
  runtimeProfile?: WorkbenchSessionRuntimeProfile | null;
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
    defaultModel: normalizeOptionalText(payload.defaultModel),
    defaultProviderId: normalizeOptionalText(payload.defaultProviderId),
    orchestrationMode: payload.orchestrationMode,
  };
}

function describeModelState(input: {
  draftProviderId: string | null;
  error: string | null;
  loading: boolean;
  modelCount: number;
}): string {
  if (!input.draftProviderId) {
    return '先设置项目默认 provider。新的 ACP 会话会优先继承它，composer 仍可按次覆盖。';
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

  return '默认 model 只会显示当前默认 provider 可用的选项；切换 provider 会自动清空旧 model。';
}

export function ProjectRuntimeProfilePanel(
  props: ProjectRuntimeProfilePanelProps,
) {
  const { onRuntimeProfileChange, projectId, runtimeProfile } = props;
  const currentProviderId = normalizeOptionalText(
    runtimeProfile?.defaultProviderId,
  );
  const currentModel = normalizeOptionalText(runtimeProfile?.defaultModel);
  const {
    loading: providersLoading,
    providers,
    selectedProviderId: draftProviderId,
    setSelectedProviderId: setDraftProviderId,
  } = useAcpProviders(currentProviderId);
  const [draftModel, setDraftModel] = useState<string | null>(currentModel);
  const [savePending, setSavePending] = useState(false);
  const lastProviderIdRef = useRef<string | null>(currentProviderId);

  useEffect(() => {
    setDraftModel(currentModel);
    lastProviderIdRef.current = currentProviderId;
  }, [currentModel, currentProviderId]);

  useEffect(() => {
    if (
      shouldResetComposerModelOnProviderChange({
        previousProviderId: lastProviderIdRef.current,
        nextProviderId: draftProviderId,
      })
    ) {
      setDraftModel(null);
    }

    lastProviderIdRef.current = draftProviderId;
  }, [draftProviderId]);

  const {
    error: providerModelsError,
    loading: providerModelsLoading,
    models: providerModels,
  } = useAcpProviderModels(draftProviderId);
  const isDirty =
    currentProviderId !== draftProviderId || currentModel !== draftModel;
  const helperText = useMemo(
    () =>
      describeModelState({
        draftProviderId,
        error: providerModelsError,
        loading: providerModelsLoading,
        modelCount: providerModels.length,
      }),
    [
      draftProviderId,
      providerModels.length,
      providerModelsError,
      providerModelsLoading,
    ],
  );

  return (
    <Card className="rounded-2xl border-border/70 bg-muted/20 shadow-none">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Runtime Profile 默认模型</div>
            <p className="text-xs leading-5 text-muted-foreground">
              这里是项目默认 provider 与 model 的唯一入口。新建 ACP 会话会先读取这里，再叠加 composer 的临时覆盖。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!isDirty || savePending}
            onClick={() => {
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
                  defaultModel: draftModel,
                  defaultProviderId: draftProviderId,
                }),
              })
                .then(async (response) => {
                  if (!response.ok) {
                    const payload = (await response.json().catch(() => null)) as {
                      detail?: string;
                      title?: string;
                    } | null;
                    throw new Error(
                      payload?.detail ??
                        payload?.title ??
                        '更新 Runtime Profile 失败',
                    );
                  }

                  const payload =
                    (await response.json()) as RuntimeProfileResponse;
                  onRuntimeProfileChange?.(toWorkbenchRuntimeProfile(payload));
                  toast.success('已更新 Runtime Profile 默认 provider/model');
                })
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : '更新 Runtime Profile 失败',
                  );
                })
                .finally(() => {
                  setSavePending(false);
                });
            }}
          >
            {savePending ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            保存默认值
          </Button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <ProjectProviderPicker
            allowClear
            disabled={savePending}
            emptyLabel="未配置默认 provider"
            loading={providersLoading}
            onValueChange={setDraftProviderId}
            providers={providers}
            value={draftProviderId}
          />
          <ProjectModelPicker
            disabled={savePending}
            error={providerModelsError}
            loading={providerModelsLoading}
            models={providerModels}
            onValueChange={setDraftModel}
            providerId={draftProviderId}
            value={draftModel}
          />
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-background px-2 py-1">
              默认 provider {draftProviderId ?? '未配置'}
            </span>
            <span className="rounded-full border border-border/60 bg-background px-2 py-1">
              默认 model {draftModel ?? '未指定'}
            </span>
          </div>
        </div>

        <div
          className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
            providerModelsError
              ? 'border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
              : 'border-border/60 bg-background/80 text-muted-foreground'
          }`}
        >
          {helperText}
        </div>
      </CardContent>
    </Card>
  );
}
