export interface ProviderPayload {
  defaultModel: string;
  id: string;
  modelsHref: string;
  name: string;
}

export interface ProviderModelPayload {
  id: string;
  name: string;
  providerId: string;
}
