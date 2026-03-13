const STORAGE_PREFIX = 'team-ai.pending-project-prompt';

function keyFor(sessionId: string): string {
  return `${STORAGE_PREFIX}:${sessionId}`;
}

export function storePendingProjectPrompt(sessionId: string, prompt: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(keyFor(sessionId), prompt);
}

export function readPendingProjectPrompt(sessionId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage.getItem(keyFor(sessionId));
}

export function clearPendingProjectPrompt(sessionId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(keyFor(sessionId));
}
