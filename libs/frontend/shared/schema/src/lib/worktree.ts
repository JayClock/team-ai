import { Collection, Entity } from '@hateoas-ts/resource';
import type { Codebase } from './codebase.js';
import type { Project } from './project.js';
import type { AcpSession } from './session.js';

export type WorktreeStatus = 'creating' | 'active' | 'error' | 'removing';

export type Worktree = Entity<
  {
    id: string;
    projectId: string;
    codebaseId: string;
    worktreePath: string;
    branch: string;
    baseBranch: string;
    status: WorktreeStatus;
    sessionId: string | null;
    label: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: Worktree;
    collection: WorktreeCollection;
    project: Project;
    codebase: Codebase;
    session?: AcpSession;
  }
>;

export type WorktreeCollection = Entity<
  Collection<Worktree>['data'],
  Collection<Worktree>['links']
>;
