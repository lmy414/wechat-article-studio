import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const dataRoot = resolve(process.env.EDITOR_DATA_DIR ?? join(projectRoot, 'data'));
export const publicRoot = join(projectRoot, 'web', 'public');
export const apiPort = Number(process.env.EDITOR_PORT ?? 8787);
export const webPort = Number(process.env.EDITOR_WEB_PORT ?? 5178);
