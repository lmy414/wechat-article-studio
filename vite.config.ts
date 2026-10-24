import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `/api` 的代理目标与端口可以用环境变量覆盖。
 *
 * 为什么需要：`tools/verify-app.mjs` 会自己起一套 Vite + API（独立端口 + 临时数据目录）
 * 来跑界面验证——这样它写数据只写进临时目录，**不会碰你正在编辑的那一份**。
 * 早先"起真实服务、写真实数据、末尾还原"的做法会把你运行期间的编辑一起还原掉，
 * 实测丢过改动，所以改成默认隔离。
 */
const apiTarget = process.env.EDITOR_API ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.EDITOR_WEB_PORT ?? 5178),
    proxy: {
      '/api': apiTarget,
    },
  },
  publicDir: 'web/public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
