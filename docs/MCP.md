# MCP 与 API

## 连接

本地 API 默认位于 `http://127.0.0.1:8787`。MCP 使用 stdio，通过 `EDITOR_API` 指向该 API。日志使用标准错误流，标准输出保留给 MCP 协议。

建议顺序：

1. `list_design_systems`、`get_design_system`：读取设计系统与组件用途。
2. `list_components`、`list_images`：确认可用字段和素材。
3. `import_images`：把本机素材复制进图片库。
4. `new_article`、`apply_plan`：组装文章，或使用单块修改工具。
5. `audit_article`、`audit_catalog`：检查文章和组件。
6. 可用时调用 `preview_article` 查看本地浏览器渲染的截图。

调用 `tools/list` 可以获得完整工具清单及输入结构。字段写入纯文本，系统会转义 HTML。

## HTTP 入口

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/health` | 读取服务状态与实际数据目录 |
| `GET /api/editor/state` | 文章、版本、图片库、模板与组件 |
| `GET /api/design-systems` | 设计系统概览 |
| `GET /api/catalog` | 当前设计系统的组件目录 |
| `POST /api/article/new` | 按设计系统新建文章 |
| `POST /api/article/replace` | 替换整篇文章 |
| `POST /api/article/mutate` | 修改字段、增删或移动组件 |
| `POST /api/article/undo` | 撤销 |
| `POST /api/article/redo` | 重做 |
| `POST /api/library/import` | 导入本机图片 |
| `GET /api/render` | 渲染正文与统计 |
| `GET /api/audit` | 文章体检 |
| `GET /api/audit/catalog` | 组件目录体检 |
| `POST /api/preview` | 返回截图与尺寸 |

写文章时带上当前 `baseRevision`。版本不一致时返回 HTTP 409，调用方应重新读取状态后再决定修改。

服务只绑定回环地址，并拒绝其他网站 Origin 的浏览器请求。图片导入可以读取本机文件，因而 API 和 MCP 只供受信任的本机客户端使用。这个项目没有面向公网的账号或鉴权系统。
