import {
  resolveComposerModel,
  shouldResetComposerModelOnProviderChange,
} from './session-composer-model';

describe('session composer model helpers', () => {
  it('uses the runtime-profile default model until an explicit override exists', () => {
    expect(
      resolveComposerModel({
        modelOverride: undefined,
        sessionDefaultModel: 'gpt-5.4',
      }),
    ).toBe('gpt-5.4');
  });

  it('keeps an explicit cleared model instead of falling back to the default', () => {
    expect(
      resolveComposerModel({
        modelOverride: null,
        sessionDefaultModel: 'gpt-5.4',
      }),
    ).toBeNull();
  });

  it('resets the selected model only after a real provider change', () => {
    expect(
      shouldResetComposerModelOnProviderChange({
        previousProviderId: null,
        nextProviderId: 'opencode',
      }),
    ).toBe(false);

    expect(
      shouldResetComposerModelOnProviderChange({
        previousProviderId: 'opencode',
        nextProviderId: 'opencode',
      }),
    ).toBe(false);

    expect(
      shouldResetComposerModelOnProviderChange({
        previousProviderId: 'opencode',
        nextProviderId: 'claude-code',
      }),
    ).toBe(true);
  });
});
