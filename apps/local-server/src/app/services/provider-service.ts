import type { ProviderModelPayload, ProviderPayload } from '../schemas/provider';

const providerCatalog: Array<{
  defaultModel: string;
  id: string;
  models: ProviderModelPayload[];
  name: string;
}> = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek' },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        providerId: 'deepseek',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', providerId: 'openai' },
      { id: 'gpt-4.1', name: 'GPT-4.1', providerId: 'openai' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-3-5-sonnet',
    models: [
      {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
      },
    ],
  },
];

export async function listProviders(): Promise<ProviderPayload[]> {
  return providerCatalog.map((provider) => ({
    id: provider.id,
    name: provider.name,
    defaultModel: provider.defaultModel,
    modelsHref: '/api/providers/models',
  }));
}

export async function listProviderModels(): Promise<ProviderModelPayload[]> {
  return providerCatalog.flatMap((provider) => provider.models);
}
