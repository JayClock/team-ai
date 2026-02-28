import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@shared/ui';
import { layoutSidebarData } from './layout-sidebar-data';
import { LayoutSidebarNavMain } from './layout-sidebar-nav-main';
import { LayoutSidebarProjects } from './layout-sidebar-projects';
import { LayoutSidebarTeamSwitcher } from './layout-sidebar-team-switcher';
import { LayoutSidebarUserMenu } from './layout-sidebar-user-menu';

export function LayoutSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <LayoutSidebarTeamSwitcher teams={layoutSidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        <LayoutSidebarNavMain items={layoutSidebarData.navMain} />
        <LayoutSidebarProjects projects={layoutSidebarData.projects} />
      </SidebarContent>
      <SidebarFooter>
        <LayoutSidebarUserMenu user={layoutSidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
