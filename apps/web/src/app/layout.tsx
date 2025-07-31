import './global.css';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import React from 'react';
import { Providers } from '@/app/Providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AntdRegistry>{children}</AntdRegistry>
        </Providers>
      </body>
    </html>
  );
}
