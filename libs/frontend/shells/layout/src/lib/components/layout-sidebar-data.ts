import {
  AudioWaveformIcon,
  BookOpenIcon,
  BotIcon,
  CommandIcon,
  FrameIcon,
  GalleryVerticalEndIcon,
  MapIcon,
  PlaySquareIcon,
  PieChartIcon,
  Settings2Icon,
  SquareTerminalIcon,
  type LucideIcon,
} from 'lucide-react';

export type SidebarTeam = {
  name: string;
  logo: LucideIcon;
  plan: string;
};

export type SidebarMainItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  items: {
    title: string;
    url: string;
  }[];
};

export type SidebarProject = {
  name: string;
  url: string;
  icon: LucideIcon;
};

export type SidebarUser = {
  name: string;
  email: string;
  avatar: string;
};

export type LayoutSidebarData = {
  user: SidebarUser;
  teams: SidebarTeam[];
  navMain: SidebarMainItem[];
  projects: SidebarProject[];
};

export const layoutSidebarData: LayoutSidebarData = {
  user: {
    name: 'shadcn',
    email: 'm@example.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: '示例团队 A',
      logo: GalleryVerticalEndIcon,
      plan: '企业版',
    },
    {
      name: '示例团队 B',
      logo: AudioWaveformIcon,
      plan: '创业版',
    },
    {
      name: '示例团队 C',
      logo: CommandIcon,
      plan: '免费版',
    },
  ],
  navMain: [
    {
      title: '工作台',
      url: '#',
      icon: SquareTerminalIcon,
      isActive: true,
      items: [
        {
          title: '历史记录',
          url: '#',
        },
        {
          title: '已标星',
          url: '#',
        },
        {
          title: '设置',
          url: '#',
        },
      ],
    },
    {
      title: '模型',
      url: '#',
      icon: BotIcon,
      items: [
        {
          title: '基础模型',
          url: '#',
        },
        {
          title: '探索模型',
          url: '#',
        },
        {
          title: '量子模型',
          url: '#',
        },
      ],
    },
    {
      title: '自动化',
      url: '#',
      icon: PlaySquareIcon,
      items: [
        {
          title: '会话',
          url: '/orchestration',
        },
      ],
    },
    {
      title: '文档',
      url: '#',
      icon: BookOpenIcon,
      items: [
        {
          title: '简介',
          url: '#',
        },
        {
          title: '快速开始',
          url: '#',
        },
        {
          title: '教程',
          url: '#',
        },
        {
          title: '变更日志',
          url: '#',
        },
      ],
    },
    {
      title: '设置',
      url: '#',
      icon: Settings2Icon,
      items: [
        {
          title: '通用',
          url: '#',
        },
        {
          title: '团队',
          url: '#',
        },
        {
          title: '账单',
          url: '#',
        },
        {
          title: '配额',
          url: '#',
        },
      ],
    },
  ],
  projects: [
    {
      name: '设计工程',
      url: '#',
      icon: FrameIcon,
    },
    {
      name: '销售与市场',
      url: '#',
      icon: PieChartIcon,
    },
    {
      name: '出行',
      url: '#',
      icon: MapIcon,
    },
  ],
};
