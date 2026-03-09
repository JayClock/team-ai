import { useEffect, useRef, useState } from 'react';
import { Button } from '@shared/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/components/card';
import { Input } from '@shared/ui/components/input';
import { Label } from '@shared/ui/components/label';
import { Textarea } from '@shared/ui/components/textarea';
import { runtimeFetch } from '@shared/util-http';

type JsonRpcErrorMeta = {
  acpCode: string;
  httpStatus: number;
  retryable: boolean;
};

type JsonRpcError = {
  code: number;
  message: string;
  meta?: JsonRpcErrorMeta;
};

type JsonRpcResponse<T> = {
  jsonrpc: string;
  id: string | number | null;
  result: T | null;
  error: JsonRpcError | null;
};

type SessionResult = {
  session?: {
    id?: string;
    state?: string;
  };
  traceId?: string;
};

type PromptResult = SessionResult & {
  runtime?: {
    output?: string;
    completedAt?: string;
  };
};

type AcpEventError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs: number;
};

type AcpEventEnvelope = {
  eventId: string;
  sessionId: string;
  type: string;
  emittedAt: string;
  data: Record<string, unknown>;
  error?: AcpEventError | null;
};

export default function AcpDebugPage() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const requestCounterRef = useRef(1);

  const [projectId, setProjectId] = useState('1');
  const [actorUserId, setActorUserId] = useState('1');
  const [provider, setProvider] = useState('team-ai');
  const [mode, setMode] = useState('CHAT');
  const [sessionId, setSessionId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [timeoutMs, setTimeoutMs] = useState('30000');
  const [traceId, setTraceId] = useState('');
  const [rpcResult, setRpcResult] = useState<string>('');
  const [events, setEvents] = useState<AcpEventEnvelope[]>([]);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const rpc = async <T,>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<JsonRpcResponse<T> | null> => {
    const requestId = `web-${requestCounterRef.current++}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (traceId.trim()) {
      headers['X-Trace-Id'] = traceId.trim();
    }

    try {
      const response = await runtimeFetch('/api/acp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: requestId,
        }),
      });
      const payload = (await response.json()) as JsonRpcResponse<T>;
      setRpcResult(JSON.stringify(payload, null, 2));
      if (payload.error) {
        setErrorMessage(`${payload.error.code}: ${payload.error.message}`);
      } else {
        setErrorMessage('');
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      setErrorMessage(message);
      return null;
    }
  };

  const createSession = async () => {
    const payload = await rpc<SessionResult>('session/new', {
      projectId,
      actorUserId,
      provider,
      mode,
    });
    const createdId = payload?.result?.session?.id;
    if (createdId) {
      setSessionId(createdId);
    }
  };

  const loadSession = async () => {
    if (!sessionId.trim()) {
      setErrorMessage('sessionId is required');
      return;
    }
    await rpc<SessionResult>('session/load', {
      projectId,
      sessionId: sessionId.trim(),
    });
  };

  const sendPrompt = async () => {
    if (!sessionId.trim()) {
      setErrorMessage('sessionId is required');
      return;
    }
    if (!prompt.trim()) {
      setErrorMessage('prompt is required');
      return;
    }
    await rpc<PromptResult>('session/prompt', {
      projectId,
      sessionId: sessionId.trim(),
      prompt,
      timeoutMs: Number(timeoutMs),
      eventId: `ui-${Date.now()}`,
    });
  };

  const cancelSession = async () => {
    if (!sessionId.trim()) {
      setErrorMessage('sessionId is required');
      return;
    }
    await rpc<SessionResult>('session/cancel', {
      projectId,
      sessionId: sessionId.trim(),
      reason: 'cancelled from web debug panel',
    });
  };

  const appendEvent = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as AcpEventEnvelope;
      setEvents((prev) => [parsed, ...prev].slice(0, 200));
    } catch {
      // Ignore non-JSON payloads in debug mode.
    }
  };

  const disconnectStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreamStatus('idle');
  };

  const connectStream = () => {
    if (!sessionId.trim()) {
      setErrorMessage('sessionId is required');
      return;
    }
    disconnectStream();

    const url = new URL('/api/acp', window.location.origin);
    url.searchParams.set('sessionId', sessionId.trim());
    const source = new EventSource(url.toString(), { withCredentials: true });

    source.addEventListener('acp-event', (event) => {
      const data = (event as MessageEvent<string>).data;
      appendEvent(data);
    });
    source.onmessage = (event) => {
      appendEvent(event.data);
    };
    source.onerror = () => {
      setStreamStatus('error');
    };
    source.onopen = () => {
      setStreamStatus('connected');
    };

    eventSourceRef.current = source;
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">ACP 调试面板</h1>
        <p className="text-sm text-slate-600">
          用于最小功能验证：创建会话、发送 prompt、实时查看事件流、取消会话。
        </p>

        <Card>
          <CardHeader>
            <CardTitle>会话参数</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="project-id">Project ID</Label>
              <Input
                id="project-id"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="actor-user-id">Actor User ID</Label>
              <Input
                id="actor-user-id"
                value={actorUserId}
                onChange={(event) => setActorUserId(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-id">Session ID</Label>
              <Input
                id="session-id"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="provider">Provider</Label>
              <Input
                id="provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mode">Mode</Label>
              <Input
                id="mode"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trace-id">Trace ID（可选）</Label>
              <Input
                id="trace-id"
                value={traceId}
                onChange={(event) => setTraceId(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>调试操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={createSession}>新建会话</Button>
              <Button variant="outline" onClick={loadSession}>
                加载会话
              </Button>
              <Button variant="outline" onClick={cancelSession}>
                取消会话
              </Button>
              <Button variant="outline" onClick={connectStream}>
                连接流
              </Button>
              <Button variant="ghost" onClick={disconnectStream}>
                断开流
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
              <div className="space-y-1">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="输入需要发送给 ACP 的 prompt"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="timeout-ms">Timeout(ms)</Label>
                <Input
                  id="timeout-ms"
                  value={timeoutMs}
                  onChange={(event) => setTimeoutMs(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={sendPrompt}>发送 Prompt</Button>
              </div>
            </div>
            <div className="text-xs text-slate-600">
              SSE 状态：
              <span className="ml-1 font-medium">{streamStatus}</span>
            </div>
            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>最近 RPC 响应</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[420px] overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                {rpcResult || '暂无响应'}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ACP 事件流</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] space-y-2 overflow-auto">
                {events.length === 0 ? (
                  <div className="text-sm text-slate-500">暂无事件，连接 SSE 后将显示。</div>
                ) : (
                  events.map((event) => (
                    <div
                      key={event.eventId}
                      className="rounded-md border border-slate-200 bg-white p-2"
                    >
                      <div className="text-xs font-medium text-slate-700">
                        {event.type} · {event.eventId}
                      </div>
                      <pre className="mt-1 overflow-auto text-xs text-slate-600">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
