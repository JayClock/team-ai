import { SafeAny } from '../archtype/safe-any.js';

export function needsJsonStringify(input: SafeAny): boolean {
  if (typeof input === 'string') {
    return false;
  }

  return !(input instanceof Buffer);
}
