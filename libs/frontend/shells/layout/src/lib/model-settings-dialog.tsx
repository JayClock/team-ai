'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@shared/ui';
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';

const API_KEY_STORAGE_KEY = 'api-key';
const MODEL_STORAGE_KEY = 'ai-model';
const DEFAULT_MODEL_ID = 'deepseek-chat';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type ModelOption = {
  id: string;
  name: string;
  provider: string;
  group: string;
};

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    group: 'DeepSeek',
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    group: 'DeepSeek',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    group: 'OpenAI',
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    group: 'Anthropic',
  },
];

function groupModelsByProvider(models: ModelOption[]) {
  return models.reduce<Record<string, ModelOption[]>>((acc, model) => {
    acc[model.group] = acc[model.group] ?? [];
    acc[model.group].push(model);
    return acc;
  }, {});
}

function getBrowserStorage(): StorageLike | null {
  const scope = globalThis as { localStorage?: StorageLike };
  return scope.localStorage ?? null;
}

function readInputValue(target: unknown): string {
  if (
    typeof target === 'object' &&
    target !== null &&
    'value' in target &&
    typeof (target as { value?: unknown }).value === 'string'
  ) {
    return (target as { value: string }).value;
  }

  return '';
}

export function ModelSettingsDialog() {
  const [open, setOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const groupedModels = useMemo(() => groupModelsByProvider(MODEL_OPTIONS), []);
  const selectedModelOption = useMemo(
    () => MODEL_OPTIONS.find((model) => model.id === selectedModel),
    [selectedModel],
  );

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!open || !storage) {
      return;
    }

    const storedApiKey = storage.getItem(API_KEY_STORAGE_KEY);
    const storedModel = storage.getItem(MODEL_STORAGE_KEY);

    setApiKey(storedApiKey ?? '');
    setSelectedModel(storedModel || DEFAULT_MODEL_ID);
    setSaved(false);
    setShowKey(false);
  }, [open]);

  const handleSave = () => {
    const storage = getBrowserStorage();
    if (!storage) {
      return;
    }

    if (apiKey.trim()) {
      storage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
    } else {
      storage.removeItem(API_KEY_STORAGE_KEY);
    }
    storage.setItem(MODEL_STORAGE_KEY, selectedModel);

    setSaved(true);
    setTimeout(() => {
      setOpen(false);
      setSaved(false);
    }, 500);
  };

  const handleClearApiKey = () => {
    const storage = getBrowserStorage();
    storage?.removeItem(API_KEY_STORAGE_KEY);
    setApiKey('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-8 gap-2" size="sm" variant="outline">
          <SlidersHorizontalIcon className="h-4 w-4" />
          AI 设置
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>模型与 API Key</DialogTitle>
          <DialogDescription>
            选择对话模型并保存 API Key。配置会存储在当前浏览器。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">模型</p>
            <ModelSelector
              open={modelSelectorOpen}
              onOpenChange={setModelSelectorOpen}
            >
              <ModelSelectorTrigger asChild>
                <Button className="w-full justify-between" variant="outline">
                  <span className="flex min-w-0 items-center gap-2">
                    <ModelSelectorLogo
                      provider={selectedModelOption?.provider || 'deepseek'}
                    />
                    <ModelSelectorName>
                      {selectedModelOption?.name || 'Select a model'}
                    </ModelSelectorName>
                  </span>
                </Button>
              </ModelSelectorTrigger>
              <ModelSelectorContent className="sm:max-w-md" title="Select Model">
                <ModelSelectorInput placeholder="Search model..." />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No model found.</ModelSelectorEmpty>
                  {Object.entries(groupedModels).map(([groupName, models]) => (
                    <ModelSelectorGroup heading={groupName} key={groupName}>
                      {models.map((model) => (
                        <ModelSelectorItem
                          key={model.id}
                          onSelect={() => {
                            setSelectedModel(model.id);
                            setModelSelectorOpen(false);
                          }}
                          value={`${model.name} ${model.id}`}
                        >
                          <ModelSelectorLogo provider={model.provider} />
                          <ModelSelectorName>{model.name}</ModelSelectorName>
                          {selectedModel === model.id ? (
                            <CheckIcon className="ml-auto size-4" />
                          ) : (
                            <span className="ml-auto size-4" />
                          )}
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
            <p className="text-xs text-muted-foreground">
              当前模型 ID: {selectedModel}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">API Key</p>
            <div className="relative">
              <Input
                className="pr-10"
                onChange={(event) => setApiKey(readInputValue(event.target))}
                placeholder="Enter your API Key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
              />
              <Button
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowKey((current) => !current)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {showKey ? (
                  <EyeOffIcon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <EyeIcon className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="sr-only">
                  {showKey ? 'Hide API Key' : 'Show API Key'}
                </span>
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button onClick={handleClearApiKey} variant="outline">
            Clear Key
          </Button>
          <Button disabled={saved} onClick={handleSave}>
            {saved ? (
              <>
                <CheckIcon className="mr-2 h-4 w-4" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
