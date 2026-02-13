import { SafeAny } from '../archtype/safe-any.js';

function isBuffer(input: SafeAny): input is Buffer {
  return typeof Buffer !== 'undefined' && input instanceof Buffer;
}

export function needsJsonStringify(input: SafeAny): boolean {
  if (typeof input === 'string') {
    return false;
  }

  return !isBuffer(input);
}
