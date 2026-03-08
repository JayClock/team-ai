export interface HealthPayload {
  check?: 'live' | 'ready';
  status: 'ok';
  service: 'local-server';
}
