import { runtimeFetch } from '@shared/util-http';
import { toast } from '@shared/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type AcpProviderStatus = 'available' | 'unavailable';

export type AcpProviderSource = 'static' | 'registry' | 'hybrid';

export type AcpProviderDistributionType = 'npx' | 'uvx' | 'binary';

export type AcpProvider = {
  command: string | null;
  description: string;
  distributionTypes: AcpProviderDistributionType[];
  envCommandKey: string;
  id: string;
  installable: boolean;
  installed: boolean;
  name: string;
  source: AcpProviderSource;
  status: AcpProviderStatus;
  unavailableReason: string | null;
};

type AcpProviderCatalogResponse = {
  registry: {
    error: string | null;
    fetchedAt: string | null;
    url: string;
  };
  _embedded: {
    providers: AcpProvider[];
  };
};

type InstallAcpProviderResponse = {
  command: string;
  distributionType: AcpProviderDistributionType;
  installedAt: string;
  providerId: string;
  success: boolean;
};

export function useAcpProviders(preferredProviderId = 'opencode') {
  const [providers, setProviders] = useState<AcpProvider[]>([]);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [installingProviderId, setInstallingProviderId] = useState<
    string | null
  >(null);
  const [selectedProviderId, setSelectedProviderId] =
    useState(preferredProviderId);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await runtimeFetch('/api/acp/providers?registry=true');
      if (!response.ok) {
        throw new Error(`Failed to load ACP providers: ${response.status}`);
      }
      const payload = (await response.json()) as AcpProviderCatalogResponse;
      setProviders(payload._embedded.providers);
      setRegistryError(payload.registry.error);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load ACP providers';
      setRegistryError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (providers.length === 0) {
      return;
    }

    const current = providers.find(
      (provider) => provider.id === selectedProviderId,
    );
    if (current) {
      return;
    }

    const availableProvider = providers.find(
      (provider) => provider.status === 'available',
    );
    setSelectedProviderId(availableProvider?.id ?? providers[0].id);
  }, [providers, selectedProviderId]);

  const install = useCallback(
    async (providerId: string) => {
      setInstallingProviderId(providerId);
      try {
        const response = await runtimeFetch('/api/acp/install', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            providerId,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string;
            title?: string;
          } | null;
          throw new Error(
            payload?.detail ||
              payload?.title ||
              `Failed to install provider ${providerId}`,
          );
        }

        const payload = (await response.json()) as InstallAcpProviderResponse;
        toast.success(
          `Prepared ${payload.providerId} via ${payload.distributionType}`,
        );
        await reload();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to install provider';
        toast.error(message);
      } finally {
        setInstallingProviderId(null);
      }
    },
    [reload],
  );

  const selectedProvider = useMemo(
    () =>
      providers.find((provider) => provider.id === selectedProviderId) ??
      providers[0] ??
      null,
    [providers, selectedProviderId],
  );

  return {
    installingProviderId,
    install,
    loading,
    providers,
    registryError,
    reload,
    selectedProvider,
    selectedProviderId,
    setSelectedProviderId,
  };
}
