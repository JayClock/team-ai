import type {
  AcpProviderCatalogPayload,
  InstallAcpProviderPayload,
} from '../schemas/acp-provider';

export function presentAcpProviders(payload: AcpProviderCatalogPayload) {
  return {
    _links: {
      self: {
        href: '/api/acp/providers{?registry}',
        templated: true,
      },
      install: {
        href: '/api/acp/install',
      },
      root: {
        href: '/api',
      },
    },
    registry: payload.registry,
    _embedded: {
      providers: payload.providers,
    },
  };
}

export function presentInstalledAcpProvider(payload: InstallAcpProviderPayload) {
  return {
    _links: {
      self: {
        href: `/api/acp/providers/${payload.providerId}`,
      },
      providers: {
        href: '/api/acp/providers{?registry}',
        templated: true,
      },
    },
    ...payload,
  };
}
