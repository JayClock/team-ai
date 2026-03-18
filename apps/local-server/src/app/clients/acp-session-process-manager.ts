export interface ManagedAcpSessionSnapshot {
  cwd: string;
  localSessionId: string;
  provider: string;
  runtimeSessionId: string;
}

export interface ManagedAcpSession<Resource> {
  cleanup: () => Promise<void>;
  cwd: string;
  localSessionId: string;
  provider: string;
  resource: Resource;
  runtimeSessionId: string;
}

export class AcpSessionProcessManager<Resource> {
  private readonly sessions = new Map<string, ManagedAcpSession<Resource>>();

  async close(): Promise<void> {
    const activeSessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(activeSessions.map((session) => session.cleanup()));
  }

  get(localSessionId: string): ManagedAcpSession<Resource> | undefined {
    return this.sessions.get(localSessionId);
  }

  has(localSessionId: string): boolean {
    return this.sessions.has(localSessionId);
  }

  list(): ManagedAcpSessionSnapshot[] {
    return [...this.sessions.values()].map((session) => ({
      cwd: session.cwd,
      localSessionId: session.localSessionId,
      provider: session.provider,
      runtimeSessionId: session.runtimeSessionId,
    }));
  }

  async register(session: ManagedAcpSession<Resource>): Promise<void> {
    const existing = this.sessions.get(session.localSessionId);
    if (existing) {
      this.sessions.delete(session.localSessionId);
      await existing.cleanup();
    }

    this.sessions.set(session.localSessionId, session);
  }

  async remove(localSessionId: string): Promise<void> {
    const session = this.take(localSessionId);
    if (!session) {
      return;
    }

    await session.cleanup();
  }

  take(localSessionId: string): ManagedAcpSession<Resource> | undefined {
    const session = this.sessions.get(localSessionId);
    if (!session) {
      return undefined;
    }

    this.sessions.delete(localSessionId);
    return session;
  }
}
