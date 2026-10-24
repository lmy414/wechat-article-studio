# 项目约定

- 文章由 `componentId` 和纯文本字段组成。业务样式封装在 `shared/packs/`，不在文章中拼 CSS。
- 同一份文章数据驱动编辑画布、导出与截图。新增版式先扩展组件和设计系统。
- 保留本地 API、MCP、图片库、版本历史和富文本复制能力。
- 默认只监听 `127.0.0.1`。文章、上传图片和导出文件分别写入忽略的 `data/`、`web/public/library/uploads/` 和 `outputs/`。
- `.private/` 内的旧项目历史、客户素材和迁移记录只留在本机，禁止提交。
- 示例使用虚构内容和项目自绘素材。真实周刊内容及第三方作品不属于 MIT 代码授权范围。
- 修改后运行 `npm run typecheck`、`npm test`、`npm run build` 和 `npm run check:public`。界面改动还要在浏览器检查。
