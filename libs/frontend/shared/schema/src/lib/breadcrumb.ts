import { Entity } from '@hateoas-ts/resource';

export type BreadcrumbItem = {
  label: string;
  path: string;
};

export type Breadcrumb = Entity<
  {
    items: BreadcrumbItem[];
  },
  {
    self: Breadcrumb;
  }
>;
