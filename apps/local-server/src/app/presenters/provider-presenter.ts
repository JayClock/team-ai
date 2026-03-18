import type {
  ProviderModelPayload,
  ProviderPayload,
} from '@orchestration/runtime-acp';

export function presentProviders(providers: ProviderPayload[]) {
  return {
    _links: {
      self: {
        href: '/api/providers',
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      providers,
    },
  };
}

export function presentProviderModels(
  providerId: string,
  models: ProviderModelPayload[],
) {
  return {
    _links: {
      self: {
        href: `/api/providers/${providerId}/models`,
      },
      providers: {
        href: '/api/providers',
      },
      root: {
        href: '/api',
      },
    },
    _embedded: {
      models,
    },
  };
}
