import { type ComponentType, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DatabaseIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  Share2Icon,
  WrenchIcon,
} from 'lucide-react';
import { ModelSettingsDialog } from './model-settings-dialog';

type SectionKey = 'workspace' | 'tools' | 'aiAgent' | 'data' | 'admin';

type NavItem = {
  label: string;
  path?: string;
  icon: ComponentType<{ className?: string }>;
};

type NavSection = {
  title: string;
  key: SectionKey;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'WORKSPACE',
    key: 'workspace',
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboardIcon }],
  },
  {
    title: 'TOOLS',
    key: 'tools',
    items: [{ label: 'Knowledge Home', path: '/home', icon: WrenchIcon }],
  },
  {
    title: 'AI AGENT',
    key: 'aiAgent',
    items: [{ label: 'Smart Domain', path: '/smart-domain', icon: BotIcon }],
  },
  {
    title: 'DATA',
    key: 'data',
    items: [{ label: 'API Root', path: '/api', icon: DatabaseIcon }],
  },
  {
    title: 'ADMIN',
    key: 'admin',
    items: [{ label: 'Settings', icon: SettingsIcon }],
  },
];

function titleCaseSegment(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    {
      workspace: true,
      tools: true,
      aiAgent: false,
      data: false,
      admin: false,
    },
  );

  const breadcrumbs = useMemo(() => {
    if (location.pathname === '/') {
      return ['Dashboard'];
    }

    return location.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => titleCaseSegment(segment));
  }, [location.pathname]);

  const isSelected = (path?: string) => {
    if (!path) {
      return false;
    }
    if (path === '/') {
      return location.pathname === '/';
    }
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="h-full w-[280px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-center gap-2 border-b border-sidebar-border">
            <Share2Icon className="h-6 w-6" />
            <span className="text-lg font-semibold tracking-wide">Team AI</span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-3">
            {NAV_SECTIONS.map((section) => (
              <div key={section.key} className="mb-2">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground"
                  onClick={() => toggleSection(section.key)}
                  type="button"
                >
                  <span className="flex-1">{section.title}</span>
                  {openSections[section.key] ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </button>

                {openSections[section.key] && (
                  <div className="px-1">
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      const selected = isSelected(item.path);

                      return (
                        <button
                          className={`mb-1 flex w-full items-center gap-3 rounded-full px-4 py-2 text-left text-sm transition-colors ${
                            selected
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          } ${!item.path ? 'cursor-not-allowed opacity-60' : ''}`}
                          disabled={!item.path}
                          key={item.label}
                          onClick={() => {
                            if (item.path) {
                              navigate(item.path);
                            }
                          }}
                          type="button"
                        >
                          <ItemIcon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-background">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="font-medium text-muted-foreground">Team AI</span>
              {breadcrumbs.map((crumb, index) => (
                <div
                  className="flex min-w-0 items-center gap-2"
                  key={`${location.pathname}-${crumb}`}
                >
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`truncate ${
                      index === breadcrumbs.length - 1
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {crumb}
                  </span>
                </div>
              ))}
            </div>
            <ModelSettingsDialog />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
