import { Entity } from '@hateoas-ts/resource';
import { Project } from './project.js';

export type LogicalEntityType = 'Evidence' | 'Participant' | 'Role' | 'Context';

export type TemporalType = 'moment' | 'interval';

export type EvidenceSubType =
  | 'rfp'
  | 'proposal'
  | 'contract'
  | 'fulfillment_request'
  | 'fulfillment_confirmation'
  | 'other_evidence';

export type ParticipantSubType = 'party' | 'thing';

export type RoleSubType =
  | 'party_role'
  | 'domain_logic_role'
  | 'third_party_role'
  | 'context_role'
  | 'evidence_role';

export type ContextSubType = 'bounded_context';

export type SubType =
  | EvidenceSubType
  | ParticipantSubType
  | RoleSubType
  | ContextSubType;

export type EntityAttribute = {
  id: string;
  name: string;
  label: string;
  type: string;
  description?: string;
  isBusinessKey: boolean;
  relation: boolean;
  visibility?: string;
};

export type EntityBehavior = {
  id: string;
  name: string;
  label: string;
  description?: string;
  returnType?: string;
};

export type EntityDefinition = {
  description?: string;
  tags?: string[];
  attributes?: EntityAttribute[];
  behaviors?: EntityBehavior[];
};

export type LogicalEntity = Entity<
  {
    id: string;
    projectId: string;
    type: LogicalEntityType;
    subType: SubType;
    name: string;
    label: string;
    definition: EntityDefinition;
  },
  {
    self: LogicalEntity;
    project: Project;
  }
>;
