# 微信排版与发布边界

## 输出形式

文章按组件渲染。正文使用内联样式，以 `section`、`p`、`span` 和 `img` 为主要标签。体检禁止脚本、外部样式表、CSS Grid、定位与浮动布局。

“兼容版”减少装饰写法，适合先做公众号预览。“装饰版”保留更多视觉效果。两种模式都需要在目标公众号中验证，不保证微信保留全部 HTML 和 CSS。

## 图片

图片先进入本地素材库，导出与复制时内联。导出发现缺图会停止，避免生成看似成功的碎图文章。

微信公众号编辑器能否接收并转存某张图片，取决于目标编辑器、图片格式和账号实际状态。复制完成后，检查所有图片，再做手机预览。必要时在后台重新上传 JPEG、PNG 或 GIF。

离线导出的 `article.json` 包含实际使用图片的内联数据，可以移动目录后再次导出。

已安装 Chrome 或 Edge 时，可用 `npm run screenshot -- --input outputs/my-article/article.json --output outputs/my-article/article.png` 生成完整长图。它与编辑器使用同一份组件和版心宽度。

## 链接

本项目默认面向普通个人订阅号。正文不插入任意站外超链接，原作出处可以显示为文字。外部网页地址存入 `publication.json` 的 `readOriginal`，在公众号后台单独填写“阅读原文”。

正文链接体检是本工具的发布配置，不代表所有类型公众号的统一权限。认证、服务号能力和特殊行业权限可能不同，应查看目标账号的后台。

二维码不是绕过外链规则的通道。目标页面应如实说明去向，由读者主动选择，不强制关注、分享或下载 App。

## 人工确认

工具负责排版和本地交付，不完成账号登录、授权或公众号发表。正式发布前，确认正文完整、图片转存、作者署名、引用授权、统计口径，以及实际 AI 生成素材的标识情况。

官方规则入口：

- [微信外部链接内容管理规范](https://weixin.qq.com/agreement/weixin_external_links_content_management_specification)
- [腾讯客服：微信访问网站被限制的相关问题](https://kf.qq.com/faq/170118UnqeUZ170118mUb6fu.html)
- [微信公众平台规则中心](https://mp.weixin.qq.com/webpoc/ruleCenter?type=oa)
