import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shared/ui';
import { CheckIcon, ChevronDownIcon, LoaderCircleIcon } from 'lucide-react';

export type ProjectModelOption = {
  id: string;
  name: string;
  providerId: string;
};

export type ProjectModelPickerProps = {
  disabled?: boolean;
  error?: string | null;
  loading?: boolean;
  models: ProjectModelOption[];
  onValueChange?: (modelId: string | null) => void;
  providerId?: string | null;
  value?: string | null;
};

function normalizeModelId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function ProjectModelPicker(props: ProjectModelPickerProps) {
  const { disabled, error, loading, models, onValueChange, providerId, value } =
    props;
  const normalizedProviderId = normalizeModelId(providerId);
  const normalizedValue = normalizeModelId(value);
  const selectedModel =
    models.find((model) => model.id === normalizedValue) ?? null;
  const emptyLabel = normalizedProviderId
    ? disabled
      ? '未指定 model'
      : '选择 model'
    : '先选择 provider';

  const triggerLabel = loading
    ? '加载 model...'
    : (selectedModel?.name ?? normalizedValue ?? emptyLabel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !normalizedProviderId}
          className="h-8 max-w-[14rem] rounded-lg px-2.5 text-xs text-slate-500 hover:text-slate-800 data-[state=open]:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:data-[state=open]:bg-[#1f2233]"
        >
          {loading ? (
            <LoaderCircleIcon className="size-3.5 animate-spin" />
          ) : null}
          <span className="truncate">{triggerLabel}</span>
          <ChevronDownIcon className="size-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="top"
        className="w-80 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-[#1e2130]"
      >
        <DropdownMenuLabel className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {normalizedProviderId ? `Model · ${normalizedProviderId}` : 'Model'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-100 dark:bg-gray-800" />

        {normalizedProviderId ? (
          <>
            <DropdownMenuItem
              onSelect={() => onValueChange?.(null)}
              className="gap-2 rounded-md px-3 py-2 text-xs text-gray-600 focus:bg-gray-50 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-800/50 dark:focus:text-gray-100"
            >
              <span className="min-w-0 flex-1 truncate">不指定 model</span>
              {!normalizedValue ? (
                <CheckIcon className="size-3.5 shrink-0" />
              ) : null}
            </DropdownMenuItem>

            {error ? (
              <div className="px-3 py-4 text-xs leading-5 text-amber-600 dark:text-amber-300">
                {error}
              </div>
            ) : models.length > 0 ? (
              models.map((model) => {
                const isSelected = model.id === normalizedValue;

                return (
                  <DropdownMenuItem
                    key={model.id}
                    onSelect={() => onValueChange?.(model.id)}
                    className={`gap-2 rounded-md px-3 py-2 text-left ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 focus:bg-blue-50 focus:text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 dark:focus:bg-blue-900/20 dark:focus:text-blue-300'
                        : 'text-gray-700 focus:bg-gray-50 focus:text-gray-900 dark:text-gray-300 dark:focus:bg-gray-800/50 dark:focus:text-gray-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {model.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">
                        {model.id}
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckIcon className="size-3.5 shrink-0" />
                    ) : null}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                当前 provider 暂无可用 model
              </div>
            )}
          </>
        ) : (
          <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
            先选择 provider，再选择 model
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
