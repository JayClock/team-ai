import { Layout } from 'antd';
import React from 'react';

const { Header, Content, Sider } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
  headerContent: React.ReactNode;
  rightContent?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  headerContent,
  rightContent,
}) => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 16px',
          borderBottom: '1px solid #f0f0f0',
          height: '56px',
          lineHeight: '56px',
        }}
      >
        {headerContent}
      </Header>
      <Layout>
        <Content style={{ padding: '16px' }}>{children}</Content>
        {rightContent && (
          <Sider
            width={350}
            style={{
              background: '#fff',
              borderLeft: '1px solid #f0f0f0',
              padding: '16px',
            }}
          >
            {rightContent}
          </Sider>
        )}
      </Layout>
    </Layout>
  );
};
