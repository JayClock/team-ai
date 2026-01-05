import type { MenuProps } from 'antd';

export interface AppMenuItem {
  key: string;
  label: string;
}

export type AppMenuItems = MenuProps['items'];
