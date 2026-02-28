import { Entity } from '@hateoas-ts/resource';

export type SidebarItemType = 'resource' | 'action' | 'external';

export type SidebarItem = {
  key?: string;
  label: string;
  path?: string | null;
  icon?: string | null;
  type?: SidebarItemType;
  rel?: string;
  href?: string;
  template?: string;
};

export type SidebarSection = {
  title: string;
  key: string;
  defaultOpen: boolean;
  order?: number;
  items: SidebarItem[];
};

export type Sidebar = Entity<
  {
    sections: SidebarSection[];
  },
  {
    self: Sidebar;
  }
>;
