import {
  resolveWorkbenchProviderLabel,
  resolveWorkbenchSessionDefaults,
  type WorkbenchSessionRuntimeProfile,
} from './session-runtime-profile';

describe('resolveWorkbenchSessionDefaults', () => {
  it('prefers runtime profile provider and orchestration mode', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        runtimeProfile: {
          defaultModel: 'gpt-5',
          defaultProviderId: 'opencode',
          orchestrationMode: 'DEVELOPER',
        },
      }),
    ).toEqual({
      model: 'gpt-5',
      providerId: 'opencode',
      role: 'DEVELOPER',
    });
  });

  it('returns null defaults when the runtime profile fields are blank', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        runtimeProfile: {
          defaultModel: '  ',
          defaultProviderId: '  ',
          orchestrationMode: 'ROUTA',
        },
      }),
    ).toEqual({
      model: null,
      providerId: null,
      role: 'ROUTA',
    });
  });

  it('falls back safely when a legacy runtime profile omits newer fields', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        runtimeProfile: {
          defaultModel: null,
          defaultProviderId: null,
        } as unknown as WorkbenchSessionRuntimeProfile,
      }),
    ).toEqual({
      model: null,
      providerId: null,
      role: 'ROUTA',
    });
  });

  it('returns a null provider when no safe fallback exists', () => {
    expect(resolveWorkbenchSessionDefaults({})).toEqual({
      model: null,
      providerId: null,
      role: 'ROUTA',
    });
  });
});

describe('resolveWorkbenchProviderLabel', () => {
  it('formats a configured provider id', () => {
    expect(resolveWorkbenchProviderLabel(' opencode ')).toBe('opencode');
  });

  it('uses a neutral label when provider is missing', () => {
    expect(resolveWorkbenchProviderLabel('  ')).toBe('未配置 provider');
  });
});
