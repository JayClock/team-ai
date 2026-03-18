export interface ManagedAcpSessionSnapshot {
  cwd: string;
  isBusy: boolean;
  lastTouchedAt: string;
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

interface ManagedAcpSessionRecord<Resource> {
  activeOperations: number;
  lastTouchedAt: string;
  session: ManagedAcpSession<Resource>;
}

export class AcpSessionProcessManager<Resource> {
  private readonly sessions = new Map<string, ManagedAcpSessionRecord<Resource>>();

  async close(): Promise<void> {
    const activeSessions = [...this.sessions.values()].map((record) => record.session);
    this.sessions.clear();
    await Promise.all(activeSessions.map((session) => session.cleanup()));
  }

  get(localSessionId: string): ManagedAcpSession<Resource> | undefined {
    return this.sessions.get(localSessionId)?.session;
  }

  has(localSessionId: string): boolean {
    return this.sessions.has(localSessionId);
  }

  list(): ManagedAcpSessionSnapshot[] {
    return [...this.sessions.values()].map((record) => ({
      cwd: record.session.cwd,
      isBusy: record.activeOperations > 0,
      lastTouchedAt: record.lastTouchedAt,
      localSessionId: record.session.localSessionId,
      provider: record.session.provider,
      runtimeSessionId: record.session.runtimeSessionId,
    }));
  }

  async register(session: ManagedAcpSession<Resource>): Promise<void> {
    const existing = this.sessions.get(session.localSessionId)?.session;
    if (existing) {
      this.sessions.delete(session.localSessionId);
      await existing.cleanup();
    }

    this.sessions.set(session.localSessionId, {
      activeOperations: 0,
      lastTouchedAt: new Date().toISOString(),
      session,
    });
  }

  async remove(localSessionId: string): Promise<void> {
    const session = this.take(localSessionId);
    if (!session) {
      return;
    }

    await session.cleanup();
  }

  touch(localSessionId: string): void {
    const record = this.sessions.get(localSessionId);
    if (!record) {
      return;
    }

    record.lastTouchedAt = new Date().toISOString();
  }

  async withActivity<TResult>(
    localSessionId: string,
    run: (session: ManagedAcpSession<Resource>) => Promise<TResult>,
  ): Promise<TResult> {
    const record = this.sessions.get(localSessionId);
    if (!record) {
      throw new Error(`ACP session ${localSessionId} is not managed`);
    }

    record.activeOperations += 1;
    record.lastTouchedAt = new Date().toISOString();

    try {
      return await run(record.session);
    } finally {
      record.activeOperations = Math.max(0, record.activeOperations - 1);
      record.lastTouchedAt = new Date().toISOString();
    }
  }

  take(localSessionId: string): ManagedAcpSession<Resource> | undefined {
    const record = this.sessions.get(localSessionId);
    if (!record) {
      return undefined;
    }

    this.sessions.delete(localSessionId);
    return record.session;
  }
}
