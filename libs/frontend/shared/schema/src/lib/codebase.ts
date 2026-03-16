import { Collection, Entity } from '@hateoas-ts/resource';
import type { Project } from './project.js';
import type { WorktreeCollection } from './worktree.js';

export type Codebase = Entity<
  {
    id: string;
    projectId: string;
    title: string;
    repoPath: string | null;
    sourceType: 'github' | 'local' | null;
    sourceUrl: string | null;
    branch: string | null;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: Codebase;
    collection: CodebaseCollection;
    project: Project;
    worktrees: WorktreeCollection;
  }
>;

export type CodebaseCollection = Entity<
  Collection<Codebase>['data'],
  Collection<Codebase>['links']
>;
