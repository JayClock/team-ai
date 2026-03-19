import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputButton,
  PromptInputProvider,
  PromptInputSubmit,
  usePromptInputController,
} from '@shared/ui';
import { runtimeFetch } from '@shared/util-http';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  Extension,
  type Editor as TiptapEditor,
  type JSONContent,
} from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import {
  ArrowRightIcon,
  CheckIcon,
  FileCode2Icon,
  LoaderCircleIcon,
  PaperclipIcon,
  SquareIcon,
} from 'lucide-react';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAcpProviderModels } from '../session/use-acp-provider-models';
import {
  ProjectModelPicker,
  type ProjectModelPickerProps,
} from './project-model-picker';
import {
  ProjectProviderPicker,
  type ProjectProviderPickerProps,
} from './project-provider-picker';
import {
  ProjectRepositoryPicker,
  type ProjectRepositoryPickerProps,
} from './project-repository-picker';

export type { ProjectProviderPickerProps } from './project-provider-picker';
export type {
  ProjectModelOption,
  ProjectModelPickerProps,
} from './project-model-picker';
export type {
  ProjectRepositoryOption,
  ProjectRepositoryPickerProps,
  ProjectWorktreeOption,
} from './project-repository-picker';

export type ProjectComposerSubmitInput = {
  cwd?: string;
  files: unknown[];
  model?: string | null;
  provider?: string;
  text: string;
};

export type ProjectComposerRepoFile = {
  fullPath: string;
  kind: 'repo-file';
  name: string;
  path: string;
  score?: number;
};

export type ProjectComposerInputProps = {
  ariaLabel: string;
  disabled?: boolean;
  footerEnd?: ReactNode;
  footerStart?: ReactNode;
  model?: ProjectComposerModelProps;
  onCancel?: () => Promise<void> | void;
  onSubmit: (input: ProjectComposerSubmitInput) => Promise<void> | void;
  placeholder: string;
  project?: ProjectComposerProjectProps;
  provider?: ProjectComposerProviderProps;
  submitPending?: boolean;
};

export type ProjectComposerModelProps = Pick<
  ProjectModelPickerProps,
  'onValueChange' | 'value'
>;

export type ProjectComposerProjectProps = Pick<
  ProjectRepositoryPickerProps,
  | 'cloneEndpoint'
  | 'onCreateWorktree'
  | 'onDeleteWorktree'
  | 'onProjectCloned'
  | 'onValidateWorktree'
  | 'onValueChange'
  | 'projects'
  | 'selectedWorktreeId'
  | 'value'
  | 'worktrees'
  | 'worktreesLoading'
>;

export type ProjectComposerProviderProps = Pick<
  ProjectProviderPickerProps,
  'loading' | 'onValueChange' | 'providers' | 'value'
>;

type ProjectComposerFileSearchResponse = {
  files?: Array<{
    fullPath: string;
    name: string;
    path: string;
    score?: number;
  }>;
};

type SuggestionItem = {
  command?: () => void;
  description?: string;
  disabled?: boolean;
  fullPath?: string;
  id: string;
  keywords?: string[];
  label: string;
  path?: string;
};

type ComposerEditorElement = HTMLElement & {
  __projectComposerEditor?: TiptapEditor;
};

const DEFAULT_PROJECT_OPTIONS: ProjectRepositoryPickerProps['projects'] = [];
const DEFAULT_PROJECT_WORKTREES: NonNullable<
  ProjectRepositoryPickerProps['worktrees']
> = [];
const EMPTY_PROVIDER_OPTIONS: ProjectProviderPickerProps['providers'] = [];

const EnterToSend = Extension.create({
  name: 'enterToSend',
  addOptions() {
    return {
      onSend: () => undefined,
    };
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;

        if ($from.parent.type.name === 'codeBlock') {
          return false;
        }

        const text = editor.getText().trim();
        if (!text) {
          return true;
        }

        this.options.onSend();
        return true;
      },
    };
  },
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRepositoryFileSearchUrl(input: {
  limit: number;
  query?: string;
  repoPath: string;
}) {
  const params = [`limit=${encodeURIComponent(String(input.limit))}`];

  if (input.query?.trim()) {
    params.push(`q=${encodeURIComponent(input.query.trim())}`);
  }

  params.push(`repoPath=${encodeURIComponent(input.repoPath)}`);

  return `/api/files/search?${params.join('&')}`;
}

function createSuggestionDropdown(triggerChar?: '@' | '/') {
  let popup: HTMLDivElement | null = null;
  let selectedIndex = 0;
  let currentItems: SuggestionItem[] = [];
  let currentCommand: ((item: SuggestionItem) => void) | null = null;

  const renderList = () => {
    if (!popup) {
      return;
    }

    popup.innerHTML = '';

    if (currentItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding: 12px 14px; color: #9ca3af; font-size: 12px; text-align: center;';

      if (triggerChar === '@') {
        empty.innerHTML =
          '<div style="margin-bottom: 4px;">📁 No files found</div><div style="font-size: 11px; opacity: 0.7;">Select a repository, then type @ to search files</div>';
      } else {
        empty.textContent = 'No results';
      }

      popup.appendChild(empty);
      return;
    }

    currentItems.forEach((item, index) => {
      const button = document.createElement('button');
      const isSelected = index === selectedIndex;

      button.type = 'button';
      button.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        text-align: left;
        padding: 6px 10px;
        border: none;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        line-height: 1.4;
        background: ${isSelected ? '#3b82f6' : 'transparent'};
        color: ${isSelected ? '#fff' : 'inherit'};
        opacity: ${item.disabled ? '0.5' : '1'};
      `;
      button.innerHTML = `
        <span style="font-size: 11px; opacity: 0.7;">${triggerChar === '/' ? '⌘' : '📄'}</span>
        <span style="font-weight: 500;">${item.label}</span>
        ${
          item.path || item.description
            ? `<span style="opacity: 0.6; font-size: 11px; margin-left: auto; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.path ?? item.description ?? ''}</span>`
            : ''
        }
      `;
      button.onmousedown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!item.disabled) {
          currentCommand?.(item);
        }
      };
      button.onmouseenter = () => {
        selectedIndex = index;
        renderList();
      };
      popup?.appendChild(button);
    });
  };

  return {
    onExit: () => {
      popup?.remove();
      popup = null;
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (!popup || currentItems.length === 0) {
        return false;
      }

      if (props.event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % currentItems.length;
        renderList();
        return true;
      }

      if (props.event.key === 'ArrowUp') {
        selectedIndex =
          (selectedIndex - 1 + currentItems.length) % currentItems.length;
        renderList();
        return true;
      }

      if (props.event.key === 'Enter') {
        const item = currentItems[selectedIndex] as SuggestionItem;
        if (!item.disabled) {
          currentCommand?.(item);
        }
        return true;
      }

      if (props.event.key === 'Escape') {
        popup?.remove();
        popup = null;
        return true;
      }

      return false;
    },
    onStart: (props: {
      clientRect?: (() => DOMRect | null) | null;
      command: (item: SuggestionItem) => void;
      items: SuggestionItem[];
    }) => {
      currentItems = props.items;
      currentCommand = props.command;
      selectedIndex = 0;

      popup = document.createElement('div');
      popup.style.cssText = `
        position: fixed;
        z-index: 100;
        min-width: 280px;
        max-width: 520px;
        max-height: 240px;
        overflow-y: auto;
        padding: 4px;
        background: #1e2130;
        color: #e5e7eb;
        border: 1px solid #374151;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      `;
      renderList();
      document.body.appendChild(popup);

      const rect = props.clientRect?.();
      if (rect) {
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 6}px`;
      }
    },
    onUpdate: (props: {
      clientRect?: (() => DOMRect | null) | null;
      command: (item: SuggestionItem) => void;
      items: SuggestionItem[];
    }) => {
      currentItems = props.items;
      currentCommand = props.command;
      selectedIndex = 0;
      renderList();

      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 6}px`;
      }
    },
  };
}

function createRepoFileMention(getRepoPath: () => string | null) {
  return Mention.extend({
    name: 'repoFileMention',
  }).configure({
    HTMLAttributes: {
      class:
        'repo-file-mention rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
    },
    renderHTML({ node }) {
      return [
        'span',
        {
          class:
            'repo-file-mention rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
          'data-path': node.attrs.path ?? node.attrs.id,
        },
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      char: '@',
      items: async ({ query }: { query: string }) => {
        const repoPath = getRepoPath();

        if (!repoPath) {
          return [];
        }

        const response = await runtimeFetch(
          buildRepositoryFileSearchUrl({
            limit: 15,
            query,
            repoPath,
          }),
        );
        if (!response.ok) {
          return [];
        }

        const payload =
          (await response.json()) as ProjectComposerFileSearchResponse;

        return (payload.files ?? []).map((file) => ({
          fullPath: file.fullPath,
          id: file.path,
          label: file.name,
          path: file.path,
        }));
      },
      render: () => createSuggestionDropdown('@'),
    },
  });
}

function createComposerCommandMention(getCommands: () => SuggestionItem[]) {
  return Mention.extend({
    name: 'composerCommandMention',
  }).configure({
    suggestion: {
      char: '/',
      command: ({ editor, props, range }) => {
        editor.chain().focus().deleteRange(range).run();

        if ('command' in props && typeof props.command === 'function') {
          props.command();
        }
      },
      items: ({ query }: { query: string }) => {
        const normalizedQuery = query.trim().toLowerCase();
        const items = getCommands();

        if (!normalizedQuery) {
          return items;
        }

        return items.filter((item) => {
          const haystacks = [
            item.id,
            item.label,
            item.description,
            ...(item.keywords ?? []),
          ]
            .filter(Boolean)
            .map((value) => value?.toLowerCase() ?? '');

          return haystacks.some((value) => value.includes(normalizedQuery));
        });
      },
      render: () => createSuggestionDropdown('/'),
    },
  });
}

function appendRepoFileContext(
  text: string,
  selectedFiles: ProjectComposerRepoFile[],
) {
  const trimmed = text.trim();

  if (selectedFiles.length === 0) {
    return trimmed;
  }

  const fileLines = Array.from(
    new Set(selectedFiles.map((file) => file.path).filter(Boolean)),
  );

  if (fileLines.length === 0) {
    return trimmed;
  }

  return `${trimmed}\n\n已选择的项目文件上下文：\n${fileLines.map((value) => `- ${value}`).join('\n')}`;
}

function extractRepoFilesFromDocument(
  document: JSONContent | null | undefined,
  activeProjectPath: string | undefined,
) {
  const files: ProjectComposerRepoFile[] = [];

  if (!document) {
    return files;
  }

  const walk = (node: JSONContent) => {
    if (node.type === 'repoFileMention' && node.attrs?.id) {
      files.push({
        fullPath:
          typeof node.attrs.fullPath === 'string'
            ? node.attrs.fullPath
            : `${activeProjectPath ?? ''}/${String(node.attrs.path ?? node.attrs.id)}`,
        kind: 'repo-file',
        name: String(node.attrs.label ?? node.attrs.id),
        path: String(node.attrs.path ?? node.attrs.id),
        score:
          typeof node.attrs.score === 'number' ? node.attrs.score : undefined,
      });
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };

  walk(document);

  return files;
}

async function convertBlobUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function ProjectComposerInput(props: ProjectComposerInputProps) {
  return (
    <PromptInputProvider>
      <ProjectComposerInputContent {...props} />
    </PromptInputProvider>
  );
}

function ProjectComposerInputContent(props: ProjectComposerInputProps) {
  const {
    ariaLabel,
    disabled,
    footerEnd,
    footerStart,
    model,
    onCancel,
    onSubmit,
    placeholder,
    project,
    provider,
    submitPending,
  } = props;
  const controller = usePromptInputController();
  const providerValue = provider?.value;
  const resolvedProviderOptions = provider?.providers ?? EMPTY_PROVIDER_OPTIONS;
  const resolvedProjectOptions = project?.projects ?? DEFAULT_PROJECT_OPTIONS;
  const resolvedProjectWorktrees: NonNullable<
    ProjectRepositoryPickerProps['worktrees']
  > = project?.worktrees ?? DEFAULT_PROJECT_WORKTREES;
  const {
    error: modelError,
    loading: modelLoading,
    models: modelOptions,
    providerId: modelProviderId,
  } = useAcpProviderModels(providerValue ?? null);
  const [plainText, setPlainText] = useState('');
  const [repoFileDialogOpen, setRepoFileDialogOpen] = useState(false);
  const [repoFileSearchQuery, setRepoFileSearchQuery] = useState('');
  const [repoFileSearchLoading, setRepoFileSearchLoading] = useState(false);
  const [repoFileSearchError, setRepoFileSearchError] = useState<
    string | null
  >(null);
  const [repoFileSearchResults, setRepoFileSearchResults] = useState<
    ProjectComposerRepoFile[]
  >([]);
  const deferredRepoFileSearchQuery = useDeferredValue(repoFileSearchQuery);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const commandItemsRef = useRef<SuggestionItem[]>([]);
  const selectedWorktree = useMemo(
    () =>
      project?.selectedWorktreeId
        ? resolvedProjectWorktrees.find(
            (worktree) => worktree.id === project.selectedWorktreeId,
          ) ?? null
        : null,
    [project?.selectedWorktreeId, resolvedProjectWorktrees],
  );
  const activeProjectPath =
    selectedWorktree?.worktreePath ?? project?.value?.repoPath ?? undefined;
  const activeProjectPathRef = useRef<string | null>(activeProjectPath ?? null);

  useEffect(() => {
    activeProjectPathRef.current = activeProjectPath ?? null;
  }, [activeProjectPath]);

  const composerCommandItems = useMemo(() => {
    const items: SuggestionItem[] = [
      {
        command: () => {
          fileInputRef.current?.click();
        },
        description: '打开系统文件选择器',
        id: 'attach-file',
        keywords: ['upload', 'file', '附件', '上传'],
        label: '添加附件',
      },
    ];

    items.unshift({
      command: () => {
        setRepoFileDialogOpen(true);
      },
      description: activeProjectPath
        ? '打开仓库文件搜索，并插入 @ 文件引用'
        : '请先选择仓库',
      disabled: !activeProjectPath,
      id: 'select-repo-file',
      keywords: ['file', 'repo', '仓库', '文件'],
      label: '选择仓库文件',
    });

    resolvedProviderOptions.forEach((providerOption) => {
      items.push({
        command: () => {
          provider?.onValueChange?.(providerOption.id);
        },
        description: providerOption.description ?? providerOption.name,
        disabled: providerOption.status === 'unavailable',
        id: `provider:${providerOption.id}`,
        keywords: ['provider', providerOption.id, providerOption.name],
        label: `切换 Provider: ${providerOption.name}`,
      });
    });

    modelOptions.forEach((modelOption) => {
      items.push({
        command: () => {
          model?.onValueChange?.(modelOption.id);
        },
        description: modelOption.providerId,
        id: `model:${modelOption.id}`,
        keywords: ['model', modelOption.id, modelOption.name],
        label: `切换 Model: ${modelOption.name}`,
      });
    });

    resolvedProjectOptions.forEach((projectOption) => {
      items.push({
        command: () => {
          project?.onValueChange?.(projectOption);
        },
        description: projectOption.repoPath ?? undefined,
        id: `project:${projectOption.id}`,
        keywords: [
          'project',
          'repo',
          projectOption.title,
          ...(projectOption.repoPath ? [projectOption.repoPath] : []),
        ],
        label: `切换仓库: ${projectOption.title}`,
      });
    });

    return items;
  }, [
    activeProjectPath,
    model,
    modelOptions,
    project,
    provider,
    resolvedProjectOptions,
    resolvedProviderOptions,
  ]);

  useEffect(() => {
    commandItemsRef.current = composerCommandItems;
  }, [composerCommandItems]);

  const handleSendRef = useRef<() => void>(() => undefined);
  const handleSendProxy = useCallback(() => {
    handleSendRef.current();
  }, []);

  const editor = useEditor({
    content: '',
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        class:
          'min-h-28 max-h-60 overflow-y-auto px-4 py-3 text-sm leading-7 text-slate-900 outline-none dark:text-slate-100 md:px-5 md:py-4 md:text-[15px]',
        role: 'textbox',
      },
    },
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      EnterToSend.configure({
        onSend: handleSendProxy,
      }),
      createRepoFileMention(() => activeProjectPathRef.current),
      createComposerCommandMention(() => commandItemsRef.current),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      const nextText = nextEditor.getText();
      setPlainText(nextText);
      controller.textInput.setInput(nextText);
    },
  });

  const selectedRepoFiles = useMemo(
    () => extractRepoFilesFromDocument(editor?.getJSON(), activeProjectPath),
    [activeProjectPath, editor, plainText],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const editorElement = editor.view.dom as ComposerEditorElement;
    editorElement.__projectComposerEditor = editor;

    return () => {
      delete editorElement.__projectComposerEditor;
    };
  }, [editor]);

  const insertRepoFileMention = useCallback(
    (file: ProjectComposerRepoFile) => {
      if (!editor) {
        return;
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: 'repoFileMention',
          attrs: {
            fullPath: file.fullPath,
            id: file.path,
            label: file.name,
            path: file.path,
            score: file.score,
          },
        })
        .insertContent(' ')
        .run();
      setRepoFileDialogOpen(false);
      setRepoFileSearchQuery('');
      setRepoFileSearchError(null);
    },
    [editor],
  );

  useEffect(() => {
    if (!repoFileDialogOpen || !activeProjectPath) {
      setRepoFileSearchLoading(false);
      setRepoFileSearchError(null);
      setRepoFileSearchResults([]);
      return;
    }

    const controllerRef = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      setRepoFileSearchLoading(true);
      setRepoFileSearchError(null);

      void runtimeFetch(
        buildRepositoryFileSearchUrl({
          limit: 20,
          query: deferredRepoFileSearchQuery,
          repoPath: activeProjectPath,
        }),
        {
          signal: controllerRef.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string; message?: string }
              | null;
            throw new Error(
              payload?.error ?? payload?.message ?? '搜索仓库文件失败',
            );
          }

          return (await response.json()) as ProjectComposerFileSearchResponse;
        })
        .then((payload) => {
          setRepoFileSearchResults(
            (payload.files ?? []).map((file) => ({
              ...file,
              kind: 'repo-file',
            })),
          );
        })
        .catch((error: unknown) => {
          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return;
          }

          setRepoFileSearchResults([]);
          setRepoFileSearchError(
            error instanceof Error ? error.message : '搜索仓库文件失败',
          );
        })
        .finally(() => {
          if (!controllerRef.signal.aborted) {
            setRepoFileSearchLoading(false);
          }
        });
    }, 150);

    return () => {
      globalThis.clearTimeout(timeoutId);
      controllerRef.abort();
    };
  }, [activeProjectPath, deferredRepoFileSearchQuery, repoFileDialogOpen]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(disabled !== true && submitPending !== true);
  }, [disabled, editor, submitPending]);

  const handleAttachmentChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.currentTarget.files) {
        controller.attachments.add(event.currentTarget.files);
      }

      event.currentTarget.value = '';
    },
    [controller.attachments],
  );

  const handleSubmit = useCallback(async () => {
    if (!editor || disabled === true || submitPending === true) {
      return;
    }

    const visibleText = editor.getText().trim();
    if (!visibleText) {
      return;
    }

    const repoFiles = extractRepoFilesFromDocument(
      editor.getJSON(),
      activeProjectPath,
    );
    let cleanedText = visibleText;

    for (const file of repoFiles) {
      const mentionPattern = new RegExp(
        `@${escapeRegExp(file.name)}\\s*`,
        'g',
      );
      cleanedText = cleanedText.replace(mentionPattern, '').trim();
    }

    const convertedAttachmentFiles = await Promise.all(
      controller.attachments.files.map(async ({ id: _id, ...item }) => {
        if (item.url && item.url.startsWith('blob:')) {
          const dataUrl = await convertBlobUrlToDataUrl(item.url);
          return {
            ...item,
            url: dataUrl ?? item.url,
          };
        }

        return item;
      }),
    );

    try {
      await onSubmit({
        cwd: activeProjectPath,
        files: [...repoFiles, ...convertedAttachmentFiles],
        model: model?.value ?? undefined,
        provider: providerValue ?? undefined,
        text: appendRepoFileContext(cleanedText || visibleText, repoFiles),
      });

      editor.commands.clearContent(true);
      setPlainText('');
      controller.textInput.clear();
      controller.attachments.clear();
    } catch {
      // Keep editor state so the user can retry.
    }
  }, [
    activeProjectPath,
    controller.attachments,
    controller.textInput,
    disabled,
    editor,
    model?.value,
    onSubmit,
    providerValue,
    submitPending,
  ]);

  useEffect(() => {
    handleSendRef.current = () => {
      void handleSubmit();
    };
  }, [handleSubmit]);

  const isSubmitDisabled =
    disabled === true ||
    (submitPending === true && !onCancel) ||
    plainText.trim().length === 0;

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />

      <div className="relative overflow-visible rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_60px_-28px_rgba(15,23,42,0.35)] transition-colors focus-within:border-amber-300/70 dark:border-[#1c1f2e] dark:bg-[#12141c] dark:shadow-none dark:focus-within:border-amber-500/30">
        <input
          aria-label="Upload files"
          className="hidden"
          multiple
          onChange={handleAttachmentChange}
          ref={fileInputRef}
          title="Upload files"
          type="file"
        />

        {controller.attachments.files.length > 0 ? (
          <div className="w-full px-4 pt-3 md:px-5 md:pt-4">
            <PromptInputAttachments className="w-full gap-2 px-0 py-0">
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
          </div>
        ) : null}

        <div className="min-h-28">
          <EditorContent editor={editor} />
        </div>

        <div className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 md:px-5 dark:border-[#1c1f2e]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <PromptInputButton
              aria-label="添加图片或文件"
              disabled={disabled === true || submitPending === true}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
            >
              <PaperclipIcon className="size-4" />
              <span>附件</span>
            </PromptInputButton>

            <ProjectRepositoryPicker
              cloneEndpoint={project?.cloneEndpoint}
              disabled={disabled === true || submitPending === true}
              onCreateWorktree={project?.onCreateWorktree}
              onDeleteWorktree={project?.onDeleteWorktree}
              onProjectCloned={project?.onProjectCloned}
              onValidateWorktree={project?.onValidateWorktree}
              onValueChange={project?.onValueChange}
              projects={resolvedProjectOptions}
              selectedWorktreeId={project?.selectedWorktreeId}
              value={project?.value}
              worktrees={resolvedProjectWorktrees}
              worktreesLoading={project?.worktreesLoading}
            />
            {footerStart}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ProjectProviderPicker
              disabled={disabled === true || submitPending === true}
              loading={provider?.loading}
              onValueChange={provider?.onValueChange}
              providers={resolvedProviderOptions}
              value={providerValue}
            />
            <ProjectModelPicker
              disabled={disabled === true || submitPending === true}
              error={modelError}
              loading={modelLoading}
              models={modelOptions}
              onValueChange={model?.onValueChange}
              providerId={modelProviderId}
              value={model?.value}
            />
            {footerEnd}

            <PromptInputSubmit
              aria-label={submitPending ? '取消会话' : '发起会话'}
              className="size-9 rounded-xl p-0"
              disabled={isSubmitDisabled}
              onClick={(event) => {
                event.preventDefault();
                if (submitPending) {
                  void onCancel?.();
                  return;
                }
                void handleSubmit();
              }}
              type="button"
            >
              {submitPending ? (
                <SquareIcon className="size-4" />
              ) : (
                <ArrowRightIcon className="size-4" />
              )}
            </PromptInputSubmit>
          </div>
        </div>
      </div>

      <Dialog
        open={repoFileDialogOpen}
        onOpenChange={(open) => {
          setRepoFileDialogOpen(open);
          if (!open) {
            setRepoFileSearchQuery('');
            setRepoFileSearchError(null);
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>选择仓库文件</DialogTitle>
            <DialogDescription>
              输入 / 打开命令，输入 @ 搜索文件。选择文件后会插入到 tiptap
              输入框里，发送时会带上文件上下文。
            </DialogDescription>
          </DialogHeader>

          <Command className="overflow-hidden rounded-none border-0 shadow-none">
            <CommandInput
              placeholder={
                activeProjectPath
                  ? '输入文件名或路径，例如 project-composer-input，或在输入框中使用 @'
                  : '请先选择仓库'
              }
              value={repoFileSearchQuery}
              onValueChange={setRepoFileSearchQuery}
            />
            <CommandList className="max-h-[360px]">
              {repoFileSearchLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  正在搜索文件...
                </div>
              ) : null}

              {!repoFileSearchLoading ? (
                <CommandEmpty>
                  {activeProjectPath
                    ? repoFileSearchError ?? '未找到匹配文件'
                    : '请先选择仓库后再搜索文件'}
                </CommandEmpty>
              ) : null}

              {repoFileSearchResults.length > 0 ? (
                <CommandGroup heading="搜索结果">
                  {repoFileSearchResults.map((file) => {
                    const isSelected = selectedRepoFiles.some(
                      (selectedFile) => selectedFile.path === file.path,
                    );

                    return (
                      <CommandItem
                        key={file.path}
                        keywords={[file.path, file.name]}
                        onSelect={() => insertRepoFileMention(file)}
                        value={`${file.name} ${file.path}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                            <FileCode2Icon className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              {file.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {file.path}
                            </div>
                          </div>
                        </div>
                        <CheckIcon
                          className={`ml-3 size-4 shrink-0 ${
                            isSelected ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
