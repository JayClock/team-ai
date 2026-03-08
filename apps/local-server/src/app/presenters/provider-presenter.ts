import type { ProviderModelPayload, ProviderPayload } from '../schemas/provider';

export function presentProviders(providers: ProviderPayload[]) {
  return {
    _links: {
      self: {
        href: '/api/providers',
      },
      models: {
        href: '/api/providers/models',
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

export function presentProviderModels(models: ProviderModelPayload[]) {
  return {
    _links: {
      self: {
        href: '/api/providers/models',
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
