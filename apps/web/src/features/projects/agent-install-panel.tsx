/**
 * AgentInstallPanel - ACP Agent Installation UI (aligned with Routa)
 *
 * Displays a list of agents from the ACP Registry with:
 * - Search/filter functionality
 * - Install/Update/Uninstall buttons
 * - Version and distribution type info
 * - Runtime availability indicators (npx, uvx)
 */
import { Button, Card, Input, ScrollArea } from '@shared/ui';
import {
  DownloadIcon,
  LoaderCircleIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AcpProvider } from './use-acp-providers';

function runtimeBadge(type: string, available: boolean) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] ${
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
  providers: AcpProvider[];
  registryError: string | null;
  runtimeAvailability: { npx: boolean; uvx: boolean };
  platform: string | null;
};

export function AgentInstallPanel({
  installingProviderId,
  loading,
  onInstall,
  onReload,
  providers,
  registryError,
  runtimeAvailability,
  platform,
}: AgentInstallPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(registryError);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return providers;
    const q = searchQuery.toLowerCase();
    return providers.filter(
      (provider) =>
        provider.name.toLowerCase().includes(q) ||
        provider.id.toLowerCase().includes(q) ||
        provider.description.toLowerCase().includes(q),
    );
  }, [providers, searchQuery]);

  const runnableCount = providers.filter(
    (p) => p.status === 'available',
  ).length;
  const unavailableCount = providers.length - runnableCount;
  const registryCount = providers.filter((p) => p.source === 'registry').length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#0f1117]">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              ACP Agents
            </h2>
            {providers.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">
                {providers.length}
              </span>
            )}
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
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
            >
              {loading ? (
                <LoaderCircleIcon className="w-4 h-4 animate-spin" />
              ) : (
                <WrenchIcon className="w-4 h-4" />
              )}
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 mb-3 text-[10px]">
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

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
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
      )}

      {/* Agent List */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 py-3">
          {loading && providers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Loading agents from registry...
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
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
                    className="p-4 border border-gray-200 bg-gray-50/60 transition-colors hover:border-gray-300 dark:border-[#2a2d3d] dark:bg-[#161922]/80 dark:hover:border-[#3a3d4d]"
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
                                {provider.distributionTypes.map((dt) => (
                                  <span
                                    key={dt}
                                    className={`rounded px-1 py-0.5 ${
                                      provider.installable
                                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-400 line-through dark:bg-[#1f2233] dark:text-gray-500'
                                    }`}
                                  >
                                    {dt}
                                  </span>
                                ))}
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

      {/* Footer */}
      <div className="shrink-0 border-t border-gray-100 px-5 py-3 text-xs text-gray-400 dark:border-gray-800">
        Platform: {platform ?? 'unknown'} • Registry:
        cdn.agentclientprotocol.com
      </div>
    </div>
  );
}
