export interface ProviderPayload {
  defaultModel: string | null;
  id: string;
  modelsHref: string;
  name: string;
}

export interface ProviderModelPayload {
  id: string;
  name: string;
  providerId: string;
}
