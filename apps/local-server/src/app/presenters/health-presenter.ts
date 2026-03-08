import type { HealthPayload } from '../schemas/health';

export function presentHealth(payload: HealthPayload): HealthPayload {
  return payload;
}
