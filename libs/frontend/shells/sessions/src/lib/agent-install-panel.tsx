import type { AcpProvider } from '@features/projects';
import { Button, Card, Input, ScrollArea } from '@shared/ui';
import {
  DownloadIcon,
  LoaderCircleIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

function runtimeBadge(type: string, available: boolean) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] ${
        available
          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
          : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
      }`}
    >
      {type} {available ? '✓' : '✗'}
    </span>
  );
}

function providerStatusLabel(value: string): string {
  switch (value) {
    case 'available':
      return '可启动';
    case 'unavailable':
      return '不可启动';
    default:
      return value;
  }
}

function providerSourceLabel(source: AcpProvider['source']): string {
  switch (source) {
    case 'registry':
      return 'ACP Registry';
    case 'environment':
      return 'Environment';
    case 'hybrid':
      return 'Hybrid';
    default:
      return 'Built-in';
  }
}

type AgentInstallPanelProps = {
  installingProviderId: string | null;
  loading: boolean;
  onInstall: (providerId: string) => Promise<void> | void;
  onReload: () => Promise<void> | void;
  platform: string | null;
  providers: AcpProvider[];
  registryError: string | null;
  runtimeAvailability: { npx: boolean; uvx: boolean };
};

export function AgentInstallPanel({
  installingProviderId,
  loading,
  onInstall,
  onReload,
  platform,
  providers,
  registryError,
  runtimeAvailability,
}: AgentInstallPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(registryError);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) {
      return providers;
    }

    const query = searchQuery.toLowerCase();
    return providers.filter(
      (provider) =>
        provider.name.toLowerCase().includes(query) ||
        provider.id.toLowerCase().includes(query) ||
        provider.description.toLowerCase().includes(query),
    );
  }, [providers, searchQuery]);

  const runnableCount = providers.filter(
    (provider) => provider.status === 'available',
  ).length;
  const unavailableCount = providers.length - runnableCount;
  const registryCount = providers.filter(
    (provider) => provider.source === 'registry',
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#0f1117]">
      <div className="shrink-0 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              ACP Agents
            </h2>
            {providers.length > 0 ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">
                {providers.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {runtimeBadge('npx', runtimeAvailability.npx)}
              {runtimeBadge('uvx', runtimeAvailability.uvx)}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                void onReload();
              }}
              disabled={loading}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:hover:text-gray-300"
            >
              {loading ? (
                <LoaderCircleIcon className="h-4 w-4 animate-spin" />
              ) : (
                <WrenchIcon className="h-4 w-4" />
              )}
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            可启动 {runnableCount}
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            不可启动 {unavailableCount}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600 dark:bg-[#1f2233] dark:text-slate-300">
            Registry {registryCount}
          </span>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search agents..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100"
          />
        </div>
      </div>

      {error ? (
        <div className="mx-5 mt-3 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline"
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-3">
          {loading && providers.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              Loading agents from registry...
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              {searchQuery
                ? 'No agents match your search'
                : 'No agents available'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAgents.map((provider) => {
                const installing = installingProviderId === provider.id;
                const canInstall = provider.installable;

                return (
                  <Card
                    key={provider.id}
                    className="border border-gray-200 bg-gray-50/60 p-4 transition-colors hover:border-gray-300 dark:border-[#2a2d3d] dark:bg-[#161922]/80 dark:hover:border-[#3a3d4d]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-sm font-semibold text-white">
                        {provider.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {provider.name}
                          </h3>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-500 dark:bg-[#1f2233] dark:text-gray-400">
                            {provider.id}
                          </span>
                          {provider.installed ? (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                              Installed
                            </span>
                          ) : null}
                        </div>

                        <p className="mb-2 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {provider.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                          <span>{providerStatusLabel(provider.status)}</span>
                          <span>•</span>
                          <span>{providerSourceLabel(provider.source)}</span>
                          <span>•</span>
                          <span className="font-mono">
                            {provider.command ?? provider.envCommandKey}
                          </span>
                          {provider.distributionTypes.length > 0 ? (
                            <>
                              <span>•</span>
                              <div className="flex gap-1">
                                {provider.distributionTypes.map(
                                  (distributionType) => (
                                    <span
                                      key={distributionType}
                                      className={`rounded px-1 py-0.5 ${
                                        provider.installable
                                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                                          : 'bg-gray-100 text-gray-400 line-through dark:bg-[#1f2233] dark:text-gray-500'
                                      }`}
                                    >
                                      {distributionType}
                                    </span>
                                  ),
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>

                        {provider.unavailableReason ? (
                          <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                            {provider.unavailableReason}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {canInstall ? (
                          <Button
                            type="button"
                            variant={provider.installed ? 'outline' : 'default'}
                            size="sm"
                            onClick={() => void onInstall(provider.id)}
                            disabled={installing}
                            className="h-8 rounded-md px-3 text-xs"
                          >
                            {installing ? (
                              <LoaderCircleIcon className="size-4 animate-spin" />
                            ) : (
                              <DownloadIcon className="size-4" />
                            )}
                            {installing
                              ? 'Installing...'
                              : provider.installed
                                ? 'Reinstall'
                                : 'Install'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-gray-100 px-5 py-3 text-xs text-gray-400 dark:border-gray-800">
        Platform: {platform ?? 'unknown'} • Registry:
        cdn.agentclientprotocol.com
      </div>
    </div>
  );
}
