import { Fragment } from 'react';
import { Link, useRouteLoaderData } from 'react-router-dom';
import {
  Breadcrumb as UIBreadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@shared/ui';
import { RESOURCE_ROUTE_ID } from '../route';
import { LoaderType } from '../generic-loader';
import { Entity, Resource } from '@hateoas-ts/resource';
import { useClient, useSuspenseResource } from '@hateoas-ts/resource-react';
import { Breadcrumb as BreadcrumbResource, BreadcrumbItem as BreadcrumbResourceItem } from '@shared/schema';

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

function mapBreadcrumbItemsToSegments(
  items: BreadcrumbResourceItem[],
): BreadcrumbSegment[] {
  return items
    .filter((item) => item.path)
    .map((item) => ({
      label: item.label,
      path: item.path,
    }));
}

function renderBreadcrumb(pathname: string, breadcrumbs: BreadcrumbSegment[]) {
  return (
    <UIBreadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/">Team AI</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <Fragment key={`${pathname}-${crumb.path}`}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.path}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </UIBreadcrumb>
  );
}

export function LayoutBreadcrumb({ pathname }: LayoutBreadcrumbProps) {
  const data = useRouteLoaderData(RESOURCE_ROUTE_ID) as LoaderType | undefined;
  if (!data) {
    return renderBreadcrumb(pathname, buildBreadcrumbSegments(pathname));
  }

  return <LayoutBreadcrumbWithState pathname={pathname} apiUrl={data.apiUrl} />;
}

function LayoutBreadcrumbWithState(props: { pathname: string; apiUrl: string }) {
  const { pathname, apiUrl } = props;
  const client = useClient();
  const { resourceState } = useSuspenseResource<Entity>(client.go(apiUrl));

  if (!resourceState.hasLink('breadcrumb')) {
    return renderBreadcrumb(pathname, buildBreadcrumbSegments(pathname));
  }

  return (
    <LayoutBreadcrumbWithResource
      pathname={pathname}
      breadcrumbResource={resourceState.follow('breadcrumb') as Resource<BreadcrumbResource>}
    />
  );
}

function LayoutBreadcrumbWithResource(props: {
  pathname: string;
  breadcrumbResource: Resource<BreadcrumbResource>;
}) {
  const { pathname, breadcrumbResource } = props;
  const { resourceState } = useSuspenseResource<BreadcrumbResource>(breadcrumbResource);
  const breadcrumbs = mapBreadcrumbItemsToSegments(resourceState.data.items);

  return renderBreadcrumb(
    pathname,
    breadcrumbs.length > 0 ? breadcrumbs : buildBreadcrumbSegments(pathname),
  );
}
