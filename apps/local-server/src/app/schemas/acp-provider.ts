export type AcpProviderStatus = 'available' | 'unavailable';

export type AcpProviderSource =
  | 'environment'
  | 'hybrid'
  | 'registry'
  | 'static';

export type AcpProviderDistributionType = 'npx' | 'uvx' | 'binary';

export interface AcpProviderPayload {
  command: string | null;
  description: string;
  distributionTypes: AcpProviderDistributionType[];
  envCommandKey: string;
  id: string;
  installable: boolean;
  installed: boolean;
  name: string;
  source: AcpProviderSource;
  status: AcpProviderStatus;
  unavailableReason: string | null;
}

export interface AcpProviderRegistryPayload {
  error: string | null;
  fetchedAt: string | null;
  url: string;
}

export interface AcpProviderCatalogPayload {
  providers: AcpProviderPayload[];
  registry: AcpProviderRegistryPayload;
}

export interface InstallAcpProviderPayload {
  command: string;
  distributionType: AcpProviderDistributionType;
  installedAt: string;
  providerId: string;
  success: boolean;
}
