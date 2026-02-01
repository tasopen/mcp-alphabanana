import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const outputDir = path.resolve(repoRoot, 'test', 'output');
export const fallbackDir = path.resolve(outputDir, 'fallback');
