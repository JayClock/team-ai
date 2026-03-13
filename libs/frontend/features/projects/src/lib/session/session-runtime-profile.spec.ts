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
          defaultProviderId: 'opencode',
          orchestrationMode: 'DEVELOPER',
        },
        selectedSessionProvider: 'codex',
        recentSessionProvider: 'claude',
      }),
    ).toEqual({
      providerId: 'opencode',
      role: 'DEVELOPER',
    });
  });

  it('falls back to the current session provider when profile provider is blank', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        runtimeProfile: {
          defaultProviderId: '  ',
          orchestrationMode: 'ROUTA',
        },
        selectedSessionProvider: 'codex',
        recentSessionProvider: 'claude',
      }),
    ).toEqual({
      providerId: 'codex',
      role: 'ROUTA',
    });
  });

  it('falls back to the latest known session provider when profile is missing', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        recentSessionProvider: 'opencode',
      }),
    ).toEqual({
      providerId: 'opencode',
      role: 'ROUTA',
    });
  });

  it('falls back safely when a legacy runtime profile omits newer fields', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        recentSessionProvider: 'opencode',
        runtimeProfile: {
          defaultProviderId: null,
        } as unknown as WorkbenchSessionRuntimeProfile,
      }),
    ).toEqual({
      providerId: 'opencode',
      role: 'ROUTA',
    });
  });

  it('returns a null provider when no safe fallback exists', () => {
    expect(resolveWorkbenchSessionDefaults({})).toEqual({
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
