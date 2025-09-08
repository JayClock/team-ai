import { ReactNode } from 'react';
import { UserOutlined } from '@ant-design/icons';
import { Avatar, Layout, Menu } from 'antd';
import { useSignal } from '@preact/signals-react';
import { ItemType, MenuItemType } from 'antd/es/menu/interface';
import { Link } from 'react-router-dom';

const { Header, Content, Sider } = Layout;

const items: ItemType<MenuItemType>[] = [
  {
    label: <Link to={'/epic-breakdown'}>史诗用户故事分解</Link>,
    key: 'epic breakdown',
  },
  { label: '用户故事定义', key: 'user story defined' },
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
