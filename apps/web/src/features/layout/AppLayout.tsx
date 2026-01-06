import { Layout } from 'antd';
import type { ReactNode } from 'react';

const { Header } = Layout;

interface AppLayoutProps {
  children: ReactNode;
  headerContent: ReactNode;
  rightContent?: ReactNode;
}

export const AppLayout = ({
  children,
  headerContent,
  rightContent,
}: AppLayoutProps) => {
  return (
    <Layout className="h-full bg-gray-50">
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          borderBottom: '1px solid #e8e8e8',
          height: '56px',
          lineHeight: '56px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
          zIndex: 10,
        }}
      >
        <div className="flex items-center justify-between h-full">
          {headerContent}
        </div>
      </Header>
      <div className="flex flex-1 overflow-hidden bg-gray-50">
        <div className="flex-shrink-0 border-r border-gray-200 bg-white shadow-sm">
          {children}
        </div>
        <div className="flex-1 flex flex-col bg-white">{rightContent}</div>
      </div>
    </Layout>
  );
};
