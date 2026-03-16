import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui';
import {
  CheckIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import type { AcpProvider } from '../session/use-acp-providers';

export type ProjectProviderPickerProps = {
  allowClear?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  loading?: boolean;
  onValueChange?: (providerId: string | null) => void;
  providers: AcpProvider[];
  value?: string | null;
};

function providerGroupLabel(key: string): string {
  switch (key) {
    case 'static-available':
      return 'Built-in - Runnable';
    case 'registry-available':
      return 'ACP Registry - Runnable';
    case 'static-unavailable':
      return 'Built-in - Unavailable';
    case 'registry-unavailable':
      return 'ACP Registry - Unavailable';
    default:
      return key;
  }
}

function normalizeProviderId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function ProjectProviderPicker(props: ProjectProviderPickerProps) {
  const {
    allowClear,
    disabled,
    emptyLabel,
    loading,
    onValueChange,
    providers,
    value,
  } = props;
  const normalizedValue = normalizeProviderId(value);
  const selectedProvider =
    providers.find((provider) => provider.id === normalizedValue) ?? null;

  const groupedProviders = useMemo(() => {
    const builtinAvailable = providers.filter(
      (provider) =>
        provider.source !== 'registry' && provider.status === 'available',
    );
    const registryAvailable = providers.filter(
      (provider) =>
        provider.source === 'registry' && provider.status === 'available',
    );
    const builtinUnavailable = providers.filter(
      (provider) =>
        provider.source !== 'registry' && provider.status !== 'available',
    );
    const registryUnavailable = providers.filter(
      (provider) =>
        provider.source === 'registry' && provider.status !== 'available',
    );

    return [
      ['static-available', builtinAvailable],
      ['registry-available', registryAvailable],
      ['static-unavailable', builtinUnavailable],
      ['registry-unavailable', registryUnavailable],
    ].filter(([, items]) => items.length > 0) as Array<[string, AcpProvider[]]>;
  }, [providers]);

  const triggerLabel = loading
    ? '加载 provider...'
    : selectedProvider?.name ??
      normalizedValue ??
      emptyLabel ??
      '选择 provider';
  const triggerStatusClass = loading
    ? 'bg-slate-300 dark:bg-slate-600'
    : selectedProvider?.status === 'available'
      ? 'bg-emerald-500'
      : normalizedValue
        ? 'bg-amber-500'
        : 'bg-slate-300 dark:bg-slate-600';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || (loading !== true && providers.length === 0)}
          className="h-8 max-w-[13rem] rounded-lg px-2.5 text-xs text-slate-500 hover:text-slate-800 data-[state=open]:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:data-[state=open]:bg-[#1f2233]"
        >
          {loading ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : (
            <span className={`size-2 rounded-full ${triggerStatusClass}`} />
          )}
          <span className="truncate">{triggerLabel}</span>
          <ChevronDownIcon className="size-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="top"
        className="w-72 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-[#1e2130]"
      >
        {allowClear ? (
          <>
            <DropdownMenuItem
              onSelect={() => onValueChange?.(null)}
              className="gap-2 rounded-md px-3 py-2 text-left text-gray-600 focus:bg-gray-50 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-800/50 dark:focus:text-gray-100"
            >
              <span className="min-w-0 flex-1 truncate text-xs">
                {emptyLabel ?? '不指定 provider'}
              </span>
              {!normalizedValue ? (
                <CheckIcon className="size-3.5 shrink-0" />
              ) : null}
            </DropdownMenuItem>
            {groupedProviders.length > 0 ? (
              <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />
            ) : null}
          </>
        ) : null}

        {groupedProviders.length > 0 ? (
          groupedProviders.map(([groupKey, items], index) => (
            <div key={groupKey}>
              {index > 0 ? (
                <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />
              ) : null}
              <DropdownMenuLabel className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {providerGroupLabel(groupKey)} ({items.length})
              </DropdownMenuLabel>
              {items.map((provider) => {
                const isAvailable = provider.status === 'available';
                const isSelected = provider.id === normalizedValue;

                return (
                  <DropdownMenuItem
                    key={provider.id}
                    onSelect={() => onValueChange?.(provider.id)}
                    className={`gap-2 rounded-md px-3 py-2 text-left ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 focus:bg-blue-50 focus:text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:focus:bg-blue-900/20 dark:focus:text-blue-300'
                        : isAvailable
                          ? 'text-gray-700 focus:bg-gray-50 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-800/50 dark:focus:text-gray-100'
                          : 'text-gray-500 opacity-60 focus:bg-gray-50 focus:text-gray-700 dark:text-gray-400 dark:focus:bg-gray-800/50 dark:focus:text-gray-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 size-1.5 shrink-0 rounded-full ${
                        isAvailable
                          ? 'bg-green-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {provider.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">
                        {provider.command ?? provider.envCommandKey}
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckIcon className="size-3.5 shrink-0" />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </div>
          ))
        ) : (
          <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
            暂无可用 provider
          </div>
        )}

        <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />
        <div className="px-2 py-1 text-center text-[10px] text-gray-400 dark:text-gray-500">
          Agent 管理入口位于页头
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
