import type { ReactNode } from 'react';

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
    <div className="h-full bg-gray-50 flex flex-col">
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center shadow-sm relative z-10">
        <div className="flex items-center justify-between w-full h-full">
          {headerContent}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden bg-gray-50">
        <div className="shrink-0 border-r border-gray-200 bg-white shadow-sm">
          {children}
        </div>
        <div className="flex-1 flex flex-col bg-white">{rightContent}</div>
      </div>
    </div>
  );
};
