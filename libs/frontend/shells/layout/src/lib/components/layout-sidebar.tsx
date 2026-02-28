import {
  BotIcon,
  DatabaseIcon,
  LayoutDashboardIcon,
  Settings2Icon,
  SquareTerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@shared/ui';
import {
  layoutSidebarData,
  SidebarMainItem,
} from './layout-sidebar-data';
import { LayoutSidebarNavMain } from './layout-sidebar-nav-main';
import { LayoutSidebarProjects } from './layout-sidebar-projects';
import { LayoutSidebarTeamSwitcher } from './layout-sidebar-team-switcher';
import { LayoutSidebarUserMenu } from './layout-sidebar-user-menu';
import { useRouteLoaderData } from 'react-router-dom';
import { RESOURCE_ROUTE_ID } from '../route';
import { LoaderType } from '../generic-loader';
import { Entity, Resource } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { Sidebar as SidebarResource, SidebarSection } from '@shared/schema';

const SIDEBAR_ICON_MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboardIcon,
  wrench: WrenchIcon,
  bot: BotIcon,
  database: DatabaseIcon,
  settings: Settings2Icon,
};

export function LayoutSidebar() {
  const data = useRouteLoaderData(RESOURCE_ROUTE_ID) as LoaderType | undefined;

  if (!data) {
    return <LayoutSidebarBase />;
  }

  return (
    <LayoutSidebarWithState apiUrl={data.apiUrl} contentType={data.contentType} />
  );
}

function LayoutSidebarWithState(props: { apiUrl: string; contentType: string }) {
  const { apiUrl, contentType } = props;
  const client = useClient();
  const { resourceState } = useSuspenseResource<Entity>(client.go(apiUrl));

  if (
    contentType === 'application/vnd.business-driven-ai.project+json' &&
    resourceState.hasLink('sidebar')
  ) {
    return (
      <LayoutSidebarWithSidebarResource
        resourceUri={resourceState.uri}
        sidebarResource={resourceState.follow('sidebar') as Resource<SidebarResource>}
      />
    );
  }

  return <LayoutSidebarBase resourceUri={resourceState.uri} />;
}

function LayoutSidebarWithSidebarResource(props: {
  resourceUri: string;
  sidebarResource: Resource<SidebarResource>;
}) {
  const { resourceUri, sidebarResource } = props;
  const { resourceState } = useSuspenseResource<SidebarResource>(sidebarResource);
  const navMain = mapSectionsToNavMain(resourceState.data.sections);

  return <LayoutSidebarBase resourceUri={resourceUri} navMain={navMain} />;
}

function LayoutSidebarBase(props: {
  resourceUri?: string;
  navMain?: SidebarMainItem[];
}) {
  const { resourceUri, navMain } = props;
  const navItems =
    navMain && navMain.length > 0 ? navMain : layoutSidebarData.navMain;

  return (
    <Sidebar collapsible="icon" data-resource-uri={resourceUri}>
      <SidebarHeader>
        <LayoutSidebarTeamSwitcher teams={layoutSidebarData.teams} />
      </SidebarHeader>
      <SidebarContent>
        <LayoutSidebarNavMain items={navItems} />
        <LayoutSidebarProjects projects={layoutSidebarData.projects} />
      </SidebarContent>
      <SidebarFooter>
        <LayoutSidebarUserMenu user={layoutSidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function mapSectionsToNavMain(sections: SidebarSection[]): SidebarMainItem[] {
  return sections.map((section) => ({
    title: section.title,
    url: '#',
    icon: resolveSidebarIcon(section.items[0]?.icon),
    isActive: section.defaultOpen,
    items: section.items.map((item) => ({
      title: item.label,
      url: normalizeSidebarPath(item.path),
    })),
  }));
}

function resolveSidebarIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) {
    return SquareTerminalIcon;
  }
  return SIDEBAR_ICON_MAP[iconName] ?? SquareTerminalIcon;
}

function normalizeSidebarPath(path: string | null | undefined): string {
  if (!path) {
    return '#';
  }
  return path;
}
