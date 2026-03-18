import { join } from 'node:path';

export function resolveDataDirectory(): string {
  return process.env.TEAMAI_DATA_DIR ?? join(process.cwd(), '.team-ai');
}
