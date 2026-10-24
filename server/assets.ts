/**
 * 素材导入：把本机文件（或一个目录里的图片）收进图片库。
 *
 * 为什么要有它：用户对 AI 的说法是"素材在哪"，AI 需要能**自己**把素材放进来。
 * 在此之前图片库只能填地址或选已有素材，AI 拿不到新的图就等于排不出图文。
 *
 * 落点固定是 `web/public/library/uploads/`：Vite 的 publicDir 就是 `web/public`，
 * 所以复制过去立刻就能通过 `/library/uploads/<name>` 访问，不需要额外的静态路由。
 *
 * 三个刻意的约束：
 * - **只复制，不移动、不删除**源文件；
 * - 文件名带内容哈希（`<名字>-<hash8><扩展名>`），重复导入同一张图不会产生第二份文件；
 * - 单个文件上限 5MB：图片最终要 base64 内联进剪贴板（约 +33%），太大的图会让粘贴非常慢。
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { publicRoot } from './config';

/** 与 vite.config.ts 的 publicDir 保持一致。 */
export const PUBLIC_DIR = publicRoot;
export const UPLOAD_DIR = join(PUBLIC_DIR, 'library', 'uploads');
export const UPLOAD_URL_PREFIX = '/library/uploads/';

const ALLOWED = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

const MAX_BYTES = 5 * 1024 * 1024;

export interface ImportRequest {
  /** 单个或多个文件的绝对/相对路径。 */
  paths?: string[];
  /** 目录：默认只取目录下第一层的图片文件。 */
  directory?: string;
  /** 目录是否递归子目录。 */
  recursive?: boolean;
  /** 素材名统一加前缀，便于一个客户的图排在一起。 */
  labelPrefix?: string;
}

export interface PreparedAsset {
  label: string;
  src: string;
  source: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface PrepareResult {
  assets: PreparedAsset[];
  skipped: { path: string; reason: string }[];
}

/** 从文件头读图片尺寸。不引依赖：PNG/JPEG/GIF 的头几个字节就够。 */
export function readImageSize(buffer: Buffer): { width: number; height: number } | undefined {
  // PNG: 8 字节签名 + IHDR，宽高在 16..24
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // GIF: "GIF87a"/"GIF89a"，宽高小端 u16
  if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  // JPEG: 逐个段跳到 SOFn（0xC0–0xCF，跳出 C4/C8/CC）
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length <= 0) break;
      offset += 2 + length;
    }
  }
  return undefined;
}

function slug(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 40) || 'asset';
}

async function listDirectory(directory: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) files.push(...await listDirectory(full, recursive));
      continue;
    }
    if (entry.isFile() && ALLOWED.has(extname(entry.name).toLowerCase())) files.push(full);
  }
  return files.sort();
}

/**
 * 收集并复制文件到上传目录。**不改动图片库**——调库是调用方的事，
 * 这样这里可以纯粹地测（只碰文件系统），也不会出现"文件复制了但库没记上"的半成品。
 */
export async function prepareAssets(request: ImportRequest): Promise<PrepareResult> {
  const candidates: string[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const item of request.paths ?? []) {
    const full = resolve(item);
    try {
      const info = await stat(full);
      if (info.isDirectory()) {
        candidates.push(...await listDirectory(full, Boolean(request.recursive)));
      } else if (info.isFile()) {
        candidates.push(full);
      } else {
        skipped.push({ path: item, reason: '既不是文件也不是目录' });
      }
    } catch {
      skipped.push({ path: item, reason: '路径不存在' });
    }
  }

  if (request.directory) {
    try {
      candidates.push(...await listDirectory(resolve(request.directory), Boolean(request.recursive)));
    } catch {
      skipped.push({ path: request.directory, reason: '目录不存在或不可读' });
    }
  }

  const unique = [...new Set(candidates)];
  if (!unique.length && !skipped.length) skipped.push({ path: '(未提供路径)', reason: 'paths 与 directory 至少给一个' });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const assets: PreparedAsset[] = [];

  for (const file of unique) {
    const extension = extname(file).toLowerCase();
    if (!ALLOWED.has(extension)) {
      skipped.push({ path: file, reason: `不支持的扩展名 ${extension || '(无)'}（支持 ${[...ALLOWED.keys()].join(' ')}）` });
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(file);
    } catch {
      skipped.push({ path: file, reason: '读不到文件' });
      continue;
    }
    if (buffer.byteLength > MAX_BYTES) {
      skipped.push({ path: file, reason: `文件 ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB 超过 5MB 上限，先压小再导` });
      continue;
    }
    const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 8);
    const name = `${slug(basename(file, extension))}-${hash}${extension}`;
    const destination = join(UPLOAD_DIR, name);
    try {
      await copyFile(file, destination);
    } catch (error) {
      skipped.push({ path: file, reason: `复制失败：${String(error)}` });
      continue;
    }
    const size = readImageSize(buffer);
    const rawLabel = basename(file, extension);
    assets.push({
      label: `${request.labelPrefix ?? ''}${rawLabel}`.trim(),
      src: `${UPLOAD_URL_PREFIX}${name}`,
      source: file,
      bytes: buffer.byteLength,
      ...(size ?? {}),
    });
  }

  return { assets, skipped };
}
