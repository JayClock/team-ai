import { runtimeFetch } from '@shared/util-http';
import { useCallback, useEffect, useState } from 'react';

export type AcpProviderModel = {
  id: string;
  name: string;
  providerId: string;
};

type AcpProviderModelsResponse = {
  _embedded: {
    models: AcpProviderModel[];
  };
};

function normalizeProviderId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function useAcpProviderModels(providerId: string | null = null) {
  const normalizedProviderId = normalizeProviderId(providerId);
  const [models, setModels] = useState<AcpProviderModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const readProviderModels = useCallback(async () => {
    if (!normalizedProviderId) {
      return [];
    }

    const response = await runtimeFetch(
      `/api/providers/${encodeURIComponent(normalizedProviderId)}/models`,
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        detail?: string;
        title?: string;
      } | null;
      throw new Error(
        payload?.detail ??
          payload?.title ??
          `Failed to load models for provider ${normalizedProviderId}`,
      );
    }

    const payload = (await response.json()) as AcpProviderModelsResponse;
    return payload._embedded.models;
  }, [normalizedProviderId]);

  const reload = useCallback(async () => {
    if (!normalizedProviderId) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      setModels(await readProviderModels());
      setError(null);
    } catch (nextError) {
      setModels([]);
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to load models',
      );
    } finally {
      setLoading(false);
    }
  }, [normalizedProviderId, readProviderModels]);

  useEffect(() => {
    let active = true;

    if (!normalizedProviderId) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    void readProviderModels()
      .then((nextModels) => {
        if (!active) {
          return;
        }
        setModels(nextModels);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }
        setModels([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load models',
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [normalizedProviderId, readProviderModels]);

  return {
    error,
    loading,
    models,
    providerId: normalizedProviderId,
    reload,
  };
}
