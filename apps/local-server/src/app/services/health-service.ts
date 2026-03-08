import { presentHealth } from '../presenters/health-presenter';
import type { HealthPayload } from '../schemas/health';

export function createHealthPayload(): HealthPayload {
  return presentHealth({
    status: 'ok',
    service: 'local-server',
  });
}
