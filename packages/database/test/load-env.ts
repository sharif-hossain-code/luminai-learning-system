import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load the repository-root .env for local runs. CI sets variables directly.
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}
