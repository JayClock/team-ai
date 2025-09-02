import React, { ReactNode } from 'react';
import {
  PieChartOutlined,
  ScissorOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Layout, Menu, MenuProps } from 'antd';
import { useSignal } from '@preact/signals-react';

const { Header, Content, Sider } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[]
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
  } as MenuItem;
}

const items: MenuItem[] = [
  getItem('AI 工具', '1', <PieChartOutlined />, [
    getItem('epic 分解', '2', <ScissorOutlined />),
  ]),
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const collapsed = useSignal(false);
  return (
    <Layout>
      <Header className="flex items-center">
        <Avatar icon={<UserOutlined />}></Avatar>
      </Header>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed.value}
          onCollapse={(value) => (collapsed.value = value)}
        >
          <Menu theme="dark" mode="inline" items={items} />
        </Sider>
        <Layout>
          <Content style={{ margin: '0 16px' }}>{children}</Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
