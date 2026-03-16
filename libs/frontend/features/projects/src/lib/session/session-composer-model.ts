function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveComposerModel(input: {
  modelOverride: string | null | undefined;
  sessionDefaultModel: string | null;
}): string | null {
  if (input.modelOverride === undefined) {
    return normalizeOptionalText(input.sessionDefaultModel);
  }

  return normalizeOptionalText(input.modelOverride);
}

export function shouldResetComposerModelOnProviderChange(input: {
  nextProviderId: string | null | undefined;
  previousProviderId: string | null | undefined;
}): boolean {
  const previousProviderId = normalizeOptionalText(input.previousProviderId);
  const nextProviderId = normalizeOptionalText(input.nextProviderId);

  return previousProviderId !== null && previousProviderId !== nextProviderId;
}
