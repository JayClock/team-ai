import {
  AcpCliProviderAdapter,
  OpencodeAcpCliProviderAdapter,
} from './acp-cli-provider.js';
import type { ResolvedAcpCliProviderPreset } from './provider-presets.js';
import {
  PROVIDER_ADAPTER_KINDS,
  type ProviderAdapter,
  type ProviderAdapterKind,
  type ProviderLaunchCommand,
} from './provider-types.js';

export interface ProviderAdapterRegistration {
  readonly kind: ProviderAdapterKind;

  create(input: {
    launchCommand: ProviderLaunchCommand;
    preset: ResolvedAcpCliProviderPreset;
  }): ProviderAdapter;
}

const registrations = new Map<ProviderAdapterKind, ProviderAdapterRegistration>();

registerProviderAdapter({
  kind: PROVIDER_ADAPTER_KINDS.acpCli,
  create: ({ preset, launchCommand }) =>
    new AcpCliProviderAdapter(preset, launchCommand),
});

registerProviderAdapter({
  kind: PROVIDER_ADAPTER_KINDS.opencodeAcpCli,
  create: ({ preset, launchCommand }) =>
    new OpencodeAcpCliProviderAdapter(preset, launchCommand),
});

export function registerProviderAdapter(
  registration: ProviderAdapterRegistration,
): void {
  registrations.set(registration.kind, registration);
}

export function createProviderAdapter(input: {
  launchCommand: ProviderLaunchCommand;
  preset: ResolvedAcpCliProviderPreset;
}): ProviderAdapter {
  const registration = registrations.get(input.preset.adapterKind);
  if (!registration) {
    throw new Error(
      `No provider adapter registered for kind: ${input.preset.adapterKind}`,
    );
  }

  return registration.create(input);
}
