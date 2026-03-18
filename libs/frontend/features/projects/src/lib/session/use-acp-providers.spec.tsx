import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAcpProviders } from './use-acp-providers';

const runtimeFetchMock = vi.fn();
const toastErrorMock = vi.fn();

type MockCatalogResponse = {
  ok: true;
  json: () => Promise<unknown>;
};

vi.mock('@shared/util-http', () => ({
  runtimeFetch: (...args: unknown[]) => runtimeFetchMock(...args),
}));

vi.mock('@shared/ui', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}));

describe('useAcpProviders', () => {
  afterEach(() => {
    runtimeFetchMock.mockReset();
    toastErrorMock.mockReset();
  });

  it('loads the local catalog first and then hydrates registry providers', async () => {
    let resolveRegistryCatalog!: (value: MockCatalogResponse) => void;

    runtimeFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          registry: {
            error: null,
            fetchedAt: null,
            url: 'https://example.test/registry.json',
          },
          _embedded: {
            providers: [
              {
                id: 'opencode',
                name: 'OpenCode',
                description: 'Built-in OpenCode',
                command: 'opencode acp',
                distributionTypes: [],
                envCommandKey: 'TEAMAI_ACP_OPENCODE_COMMAND',
                installable: false,
                installed: false,
                source: 'static',
                status: 'available',
                unavailableReason: null,
              },
            ],
          },
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise<MockCatalogResponse>((resolve) => {
            resolveRegistryCatalog = resolve;
          }),
      );

    const { result } = renderHook(() => useAcpProviders());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.providers).toHaveLength(1);
    });

    resolveRegistryCatalog({
      ok: true,
      json: async () => ({
        registry: {
          error: null,
          fetchedAt: '2026-03-18T00:00:00.000Z',
          url: 'https://example.test/registry.json',
        },
        _embedded: {
          providers: [
            {
              id: 'opencode',
              name: 'OpenCode',
              description: 'Built-in OpenCode',
              command: 'opencode acp',
              distributionTypes: [],
              envCommandKey: 'TEAMAI_ACP_OPENCODE_COMMAND',
              installable: false,
              installed: false,
              source: 'static',
              status: 'available',
              unavailableReason: null,
            },
            {
              id: 'example-registry-agent',
              name: 'Example Registry Agent',
              description: 'Registry agent',
              command: 'npx -y @example/agent',
              distributionTypes: ['npx'],
              envCommandKey: 'TEAMAI_ACP_EXAMPLE_REGISTRY_AGENT_COMMAND',
              installable: true,
              installed: false,
              source: 'registry',
              status: 'available',
              unavailableReason: null,
            },
          ],
        },
      }),
    });

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(2);
    });

    expect(runtimeFetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/acp/providers?registry=false',
    );
    expect(runtimeFetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/acp/providers?registry=true',
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
