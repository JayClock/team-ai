import type { McpToolDefinition } from '../contracts';
import { acpToolCatalog } from './acp-tools';
import { agentToolCatalog } from './agent-tools';
import { noteToolCatalog } from './note-tools';
import { projectToolCatalog } from './project-tools';
import { taskToolCatalog } from './task-tools';

export type { LocalMcpToolRegistration } from './types';

export const localMcpToolCatalog = [
  ...projectToolCatalog,
  ...agentToolCatalog,
  ...taskToolCatalog,
  ...noteToolCatalog,
  ...acpToolCatalog,
] as const;

export const localMcpToolDefinitions = localMcpToolCatalog.map(
  (toolRegistration) => toolRegistration.definition,
) as readonly McpToolDefinition[];
