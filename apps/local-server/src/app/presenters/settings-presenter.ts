import type { SettingsPayload } from '../schemas/settings';

export function presentSettings(payload: SettingsPayload) {
  return {
    _links: {
      self: {
        href: '/api/settings',
      },
      root: {
        href: '/api',
      },
    },
    ...payload,
  };
}
