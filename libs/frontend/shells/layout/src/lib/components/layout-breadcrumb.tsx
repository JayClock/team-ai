import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@shared/ui';

type BreadcrumbSegment = {
  label: string;
  path: string;
};

type LayoutBreadcrumbProps = {
  pathname: string;
};

function titleCaseSegment(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function buildBreadcrumbSegments(pathname: string): BreadcrumbSegment[] {
  if (pathname === '/') {
    return [{ label: 'Dashboard', path: '/' }];
  }

  let currentPath = '';
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      currentPath += `/${segment}`;
      return {
        label: titleCaseSegment(segment),
        path: currentPath,
      };
    });
}

export function LayoutBreadcrumb({ pathname }: LayoutBreadcrumbProps) {
  const breadcrumbs = buildBreadcrumbSegments(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/">Team AI</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <BreadcrumbItem key={`${pathname}-${crumb.path}`}>
              <BreadcrumbSeparator />
              {isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.path}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
