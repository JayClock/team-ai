import { State } from '@hateoas-ts/resource';
import { Project } from '@shared/schema';

export interface Props {
  state?: State<Project>;
}
