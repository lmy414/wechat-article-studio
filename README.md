# WeChat Article Studio

本地运行的微信公众号排版工作台。用组件组织图文，在浏览器里改字、换图、调整顺序，再复制富文本到公众号后台。

软件使用 MIT 协议。编辑数据和上传素材保存在本机。工具不登录公众号，也不代替你确认发布。

## 功能

- 9 个通用组件与 6 个周刊组件，包含导语、章节、配图、引用、刊头和作品卡。
- 拖放排版、字段编辑、图片库、自动保存、撤销、重做和版本历史。
- 两套设计系统，统一约束颜色、字号与组件用途。
- 兼容版和装饰版 HTML、富文本复制、图片内联及离线预览文件。
- 周刊 JSON 导入，保留作品顺序、名次、作者、简介和指标。
- MCP stdio 服务，供 AI 读取组件目录、导入素材、排版和体检。
- 可选的本地 Chrome / Edge 截图通道。

## 启动

需要 Node.js 22.12 或更新版本。

```bash
git clone https://github.com/lmy414/wechat-article-studio.git
cd wechat-article-studio
npm ci
npm run dev
```

打开 <http://127.0.0.1:5178>。API 默认监听 `127.0.0.1:8787`。

也可以先构建，再从同一个端口使用完整工作台：

```bash
npm run build
npm start
```

打开 <http://127.0.0.1:8787>。静态页面与 API 使用同一个本地服务。`npm start` 需要普通 `npm ci` 安装的开发工具，勿使用 `--omit=dev`。

首次运行会生成示例文章。示例内容是虚构的，插画由项目自绘，不依赖客户素材或外部服务。

## 编辑与交付

1. 左侧选择组件，点击缩略图或拖到画布中。
2. 点击内容块，编辑字段。图片从图片库选择。
3. 在大纲中调整顺序，在版本历史中恢复内容。
4. 点击“导出”，再点“复制到公众号”。在公众号正文编辑区粘贴。
5. 检查图片是否转存，完成公众号手机预览，再确认发表。

图片复制使用内联数据。浏览器复制成功不代表公众号已完成图片转存。公众号权限、编辑器过滤和真机效果仍需在目标账号中检查。

当前的正文链接检查按普通个人订阅号配置：原作链接放在后台“阅读原文”，正文保留可读的出处。它不是微信官方审核器。

### 导出独立文件

```bash
npm run export -- --output outputs/my-article
```

也可以导出指定的文章快照：

```bash
npm run export -- --input examples/article.json --output outputs/example
```

导出目录包含：

| 文件 | 用途 |
| --- | --- |
| `preview.html` | 离线预览，带“复制到公众号”按钮 |
| `body.html` | 仅正文、内联样式和图片，无脚本 |
| `article.json` | 可再次导出的文章与内联图片 |
| `publication.json` | 标题、作者、摘要与阅读原文地址 |
| `audit.json` | 文章体检与导出统计 |
| `公众号发布说明.txt` | 后台填写与粘贴说明 |

可以把 `publication.json` 传给导出命令：`--publication path/to/publication.json`。这些字段在公众号后台单独填写，不会混进正文。

### 导入周刊

先启动工作台，再运行：

```bash
npm run import:weekly -- --issue examples/weekly-issue.json --assets examples/images --config examples/weekly-config.json --output outputs/sample-weekly
```

示例图片目录见 [examples/README.md](examples/README.md)。真实使用时，填写你自己的 JSON 和图片目录。图片按封面字段的文件名匹配，同名 JPEG / PNG 可以替代 WebP。

导入会更新当前文章，并生成独立导出文件。程序检查名次连续性、重复 BV 号、分数顺序与作者数量；发现不一致会停止，不会重新排名或补造数据。

## MCP

API 启动后，在项目目录运行 `npm run mcp` 即可启动 stdio 服务。客户端需把工作目录设为项目根目录，示例配置如下：

```json
{
  "mcpServers": {
    "wechat-article-studio": {
      "command": "node",
      "args": ["--import", "tsx", "server/mcp.ts"],
      "cwd": "/absolute/path/to/wechat-article-studio",
      "env": { "EDITOR_API": "http://127.0.0.1:8787" }
    }
  }
}
```

客户端若不支持 `cwd`，请改用该客户端支持的启动脚本或绝对路径配置。接口与操作顺序见 [MCP 与 API](docs/MCP.md)。

## 配置

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `EDITOR_PORT` | `8787` | 本地 API 与构建后页面的端口 |
| `EDITOR_WEB_PORT` | `5178` | Vite 开发页面端口 |
| `EDITOR_API` | `http://127.0.0.1:8787` | MCP、导入工具与 Vite 代理目标 |
| `EDITOR_DATA_DIR` | 项目下的 `data/` | 状态与版本文件 |
| `EDITOR_BROWSER` | 自动查找 | Chrome / Edge 可执行文件，用于截图 |

改 API 端口时，也需相应设置 `EDITOR_API`。截图支持常见 Windows、macOS 和 Linux 安装路径；编辑和导出不要求安装浏览器截图依赖。

## 开发与验证

```bash
npm run typecheck
npm test
npm run build
npm run check:public
```

测试覆盖文章迁移、字段清空、组件体检、片单一致性、图片内联、便携导出、真实 API 的版本冲突与撤销重做，以及 MCP stdio 通信。测试使用临时数据目录，不修改正在编辑的文章。

目录结构：

```text
shared/     文章模型、组件、设计系统与体检
web/        React 编辑器
server/     本地 API、状态存储、素材与导出
tools/      周刊导入、文章导出与公开源码检查
tests/      单元与集成测试
examples/   虚构示例和自绘素材
docs/       使用约束与扩展说明
```

扩展版式时，在 `shared/packs/` 新建组件，再登记到设计系统。文章只填纯文本字段与素材 id，样式留在组件内部。

## 数据与许可

`data/`、`outputs/`、上传图片、`.env` 和 `.private/` 已加入忽略规则。发布源码时，不要把这些目录强制加入 Git。

MIT 授权覆盖本项目代码与自绘示例素材。导入文章、角色图片、视频封面、音乐、商标与其他第三方内容，仍由相应权利人授权。第三方依赖使用各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
