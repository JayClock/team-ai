import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { ProjectRuntimeProfilePanel } from './project-runtime-profile-panel';

const runtimeFetchMock = vi.fn();

vi.mock('@shared/util-http', () => ({
  runtimeFetch: (...args: unknown[]) => runtimeFetchMock(...args),
}));

vi.mock('../session/use-acp-providers', () => ({
  useAcpProviders: (preferredProviderId: string | null = null) => {
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
      preferredProviderId,
    );

    useEffect(() => {
      setSelectedProviderId(preferredProviderId);
    }, [preferredProviderId]);

    return {
      loading: false,
      providers: [
        {
          command: 'opencode',
          description: 'OpenCode',
          distributionTypes: ['binary'],
          envCommandKey: 'OPENCODE_COMMAND',
          id: 'opencode',
          installable: true,
          installed: true,
          name: 'OpenCode',
          source: 'static',
          status: 'available',
          unavailableReason: null,
        },
        {
          command: 'codex',
          description: 'Codex',
          distributionTypes: ['binary'],
          envCommandKey: 'CODEX_COMMAND',
          id: 'codex',
          installable: true,
          installed: true,
          name: 'Codex',
          source: 'static',
          status: 'available',
          unavailableReason: null,
        },
      ],
      selectedProviderId,
      setSelectedProviderId,
    };
  },
}));

vi.mock('../session/use-acp-provider-models', () => ({
  useAcpProviderModels: (providerId: string | null = null) => {
    if (providerId === 'codex') {
      return {
        error: 'Provider codex does not support runtime model listing',
        loading: false,
        models: [],
      };
    }

    if (providerId === 'opencode') {
      return {
        error: null,
        loading: false,
        models: [
          {
            id: 'openai/gpt-5-mini',
            name: 'GPT 5 Mini',
            providerId: 'opencode',
          },
          {
            id: 'openai/gpt-5',
            name: 'GPT 5',
            providerId: 'opencode',
          },
        ],
      };
    }

    return {
      error: null,
      loading: false,
      models: [],
    };
  },
}));

vi.mock('./project-provider-picker', () => ({
  ProjectProviderPicker: (props: {
    onValueChange?: (providerId: string | null) => void;
    value?: string | null;
  }) => (
    <div>
      <div>{`provider-value:${props.value ?? 'null'}`}</div>
      <button type="button" onClick={() => props.onValueChange?.('opencode')}>
        选择 opencode
      </button>
      <button type="button" onClick={() => props.onValueChange?.('codex')}>
        选择 codex
      </button>
      <button type="button" onClick={() => props.onValueChange?.(null)}>
        清空 provider
      </button>
    </div>
  ),
}));

vi.mock('./project-model-picker', () => ({
  ProjectModelPicker: (props: {
    onValueChange?: (modelId: string | null) => void;
    providerId?: string | null;
    value?: string | null;
  }) => (
    <div>
      <div>{`model-provider:${props.providerId ?? 'null'}`}</div>
      <div>{`model-value:${props.value ?? 'null'}`}</div>
      <button
        type="button"
        onClick={() => props.onValueChange?.('openai/gpt-5-mini')}
      >
        选择 gpt-5-mini
      </button>
      <button type="button" onClick={() => props.onValueChange?.(null)}>
        清空 model
      </button>
    </div>
  ),
}));

describe('ProjectRuntimeProfilePanel', () => {
  afterEach(() => {
    runtimeFetchMock.mockReset();
  });

  it('resets the default model when the default provider changes', async () => {
    render(
      <ProjectRuntimeProfilePanel
        projectId="project-1"
        runtimeProfile={{
          defaultModel: 'openai/gpt-5-mini',
          defaultProviderId: 'opencode',
          orchestrationMode: 'ROUTA',
        }}
      />,
    );

    expect(screen.getByText('model-value:openai/gpt-5-mini')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '选择 codex' }));

    await waitFor(() => {
      expect(screen.getByText('provider-value:codex')).toBeTruthy();
      expect(screen.getByText('model-value:null')).toBeTruthy();
    });
  });

  it('shows a clear empty state when the provider has no model list', async () => {
    render(
      <ProjectRuntimeProfilePanel
        projectId="project-1"
        runtimeProfile={{
          defaultModel: null,
          defaultProviderId: 'opencode',
          orchestrationMode: 'ROUTA',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择 codex' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Provider codex does not support runtime model listing',
        ),
      ).toBeTruthy();
    });
  });

  it('saves the selected runtime profile defaults', async () => {
    const onRuntimeProfileChange = vi.fn();
    runtimeFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        defaultModel: null,
        defaultProviderId: 'opencode',
        orchestrationMode: 'ROUTA',
      }),
    });

    render(
      <ProjectRuntimeProfilePanel
        onRuntimeProfileChange={onRuntimeProfileChange}
        projectId="project-1"
        runtimeProfile={{
          defaultModel: 'openai/gpt-5-mini',
          defaultProviderId: 'opencode',
          orchestrationMode: 'ROUTA',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '清空 model' }));
    fireEvent.click(screen.getByRole('button', { name: '保存默认值' }));

    await waitFor(() => {
      expect(runtimeFetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/runtime-profile',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            defaultModel: null,
            defaultProviderId: 'opencode',
          }),
        }),
      );
    });

    expect(onRuntimeProfileChange).toHaveBeenCalledWith({
      defaultModel: null,
      defaultProviderId: 'opencode',
      orchestrationMode: 'ROUTA',
    });
  });
});
