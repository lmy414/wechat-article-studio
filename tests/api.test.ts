import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { projectRoot } from '../server/config';

let child: ChildProcess;
let directory = '';
let base = '';
let errors = '';
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function request(path: string, data?: unknown) {
  const response = await fetch(`${base}${path}`, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {});
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((done) => probe.close(() => done()));
  directory = await mkdtemp(join(tmpdir(), 'article-api-'));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--import', 'tsx', join(projectRoot, 'server/index.ts')], {
    cwd: projectRoot, windowsHide: true,
    env: { ...process.env, EDITOR_PORT: String(port), EDITOR_DATA_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr?.on('data', (chunk) => { errors += String(chunk); });
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(errors);
    try { if ((await request('/api/health')).body.dataDir === directory) return; } catch { /* 等服务就绪 */ }
    await delay(100);
  }
  throw new Error(`本地 API 未就绪：${errors}`);
}, 15_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((done) => child.once('exit', () => done()));
    child.kill();
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('真实 API 与 MCP', () => {
  it('健康检查与完整写接口载荷一致', async () => {
    const state = (await request('/api/editor/state')).body;
    const result = await request('/api/article/mutate', { baseRevision: state.document.revision, patch: { kind: 'set-meta', field: 'title', value: '接口回归文章' }, source: 'human' });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('components');
    expect(result.body).toHaveProperty('templates');
    expect(result.body.document.title).toBe('接口回归文章');
    expect((await request('/api/article/mutate', { baseRevision: state.document.revision, patch: { kind: 'set-meta', field: 'title', value: '旧版本覆盖' }, source: 'human' })).status).toBe(409);
  });

  it('撤销和重做保留内容与版本', async () => {
    expect((await request('/api/article/undo', {})).body.document.title).not.toBe('接口回归文章');
    expect((await request('/api/article/redo', {})).body.document.title).toBe('接口回归文章');
  });

  it('拒绝其他网站调用本地 API', async () => {
    const response = await fetch(`${base}/api/editor/state`, { headers: { Origin: 'https://example.com' } });
    expect(response.status).toBe(403);
  });

  it('导入图片后可通过本地服务访问，重复导入返回同一个素材 id', async () => {
    const payload = { paths: [join(projectRoot, 'web/public/library/sample/cover.svg')], categoryId: 'covers' };
    const first = (await request('/api/library/import', payload)).body;
    const second = (await request('/api/library/import', payload)).body;
    expect(first.import.assets[0].id).toBeTruthy();
    expect(second.import.imported).toBe(0);
    expect(second.import.assets[0].id).toBe(first.import.assets[0].id);
    const image = await fetch(`${base}${first.import.assets[0].src}`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('MCP 通过 stdio 读取设计系统和文章', async () => {
    const client = new Client({ name: 'article-studio-test', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', join(projectRoot, 'server/mcp.ts')], cwd: projectRoot, env: { ...process.env, EDITOR_API: base } as Record<string, string> });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.some((tool) => tool.name === 'apply_plan')).toBe(true);
      const result = await client.callTool({ name: 'get_article', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain('接口回归文章');
    } finally { await client.close(); }
  }, 15_000);
});
