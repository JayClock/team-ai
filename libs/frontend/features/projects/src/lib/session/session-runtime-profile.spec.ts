import {
  resolveWorkbenchProviderLabel,
  resolveWorkbenchRuntimeRoleDefault,
  resolveWorkbenchSessionDefaults,
  type WorkbenchSessionRuntimeProfile,
} from './session-runtime-profile';

describe('resolveWorkbenchSessionDefaults', () => {
  it('prefers runtime profile provider and orchestration mode', () => {
    expect(
      resolveWorkbenchSessionDefaults({
        runtimeProfile: {
          orchestrationMode: 'DEVELOPER',
          roleDefaults: {
            DEVELOPER: {
              model: 'gpt-5',
              providerId: 'opencode',
            },
          },
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
          orchestrationMode: 'ROUTA',
          roleDefaults: {
            ROUTA: {
              model: '  ',
              providerId: '  ',
            },
          },
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
          roleDefaults: {},
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

describe('resolveWorkbenchRuntimeRoleDefault', () => {
  it('reads a configured role default', () => {
    expect(
      resolveWorkbenchRuntimeRoleDefault(
        {
          GATE: {
            model: 'gpt-5-mini',
            providerId: 'opencode',
          },
        },
        'GATE',
      ),
    ).toEqual({
      model: 'gpt-5-mini',
      providerId: 'opencode',
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
