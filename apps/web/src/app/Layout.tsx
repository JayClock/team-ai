import { Layout } from 'antd';
import React from 'react';

const { Header } = Layout;

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
    <Layout className="h-full">
      <Header
        style={{
          background: '#fff',
          padding: '0 16px',
          borderBottom: '1px solid #f0f0f0',
          height: '56px',
          lineHeight: '56px',
        }}
      >
        <div className="content-between items-center">{headerContent}</div>
      </Header>
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        <div>{children}</div>
        <div className="flex-1">{rightContent}</div>
      </div>
    </Layout>
  );
};
