import { presentHealth } from '../presenters/health-presenter';
import type { HealthPayload } from '../schemas/health';

export function createHealthPayload(
  check?: HealthPayload['check'],
): HealthPayload {
  return presentHealth({
    check,
    status: 'ok',
    service: 'local-server',
  });
}
