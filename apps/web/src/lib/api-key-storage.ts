const STORAGE_KEY = 'api-key';

export const apiKeyStorage = {
  get(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  },

  set(apiKey: string): void {
    localStorage.setItem(STORAGE_KEY, apiKey);
  },

  remove(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  exists(): boolean {
    return !!this.get();
  },
};
