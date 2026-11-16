# GitHub Pages 适配设计（历史方案）

此方案已被用户后续确认的[两个平台独立部署](../../独立部署说明.md)替代。以下仅保留设计记录，不作为当前部署配置。

用户已选择 Pages 前端 + Cloudflare API，沿用 https://atlas-world-map-20261116.weirdopursuer.workers.dev；保留本地开发、Node 启动与完整 Cloudflare 部署。测试后提交并推送当前仓库。

- 普通开发、构建与部署默认 base 为 /、API 为同源。
- 新增 build:pages：从 Vite pages 模式读取公开配置，生成纯静态 dist，默认项目路径 /atlas-world-map/；支持 VITE_BASE_PATH=/ 自定义域名。
- 所有 public 素材路径通过 BASE_URL 拼接；API 单独通过 VITE_API_BASE_URL 拼接，不能带入 Pages 子路径。几何 Worker/动态 import 继续交给 Vite 重写。
- API 默认沿用用户确认的 Worker 地址，允许仓库变量覆盖。Pages 构建要求有效 HTTPS API 根地址，避免静默请求 Pages 自身的不存在接口。
- Worker 通过 CORS_ALLOWED_ORIGINS 精确允许 https://shitou186.github.io 和默认本地预览来源 localhost/127.0.0.1:4173，支持预检、成功和失败响应，保留同源请求、二进制和 HEAD。
- 自动工作流：main 推送/手动触发 -> Node22 + pnpm固定版本 -> 安装 -> 测试 -> Pages 构建 -> 上传纯静态产物 -> 官方 Pages 部署。使用 configure-pages 输出的 base_path 兼容自定义域名。
- README 说明仓库 Pages 设置、公开变量、Worker 更新、预览、本地开发和测试。VITE_* 不承载秘密。
- 验证默认根路径、Pages 子路径、资源/纹理/模型、Worker 动态依赖、独立 API、CORS、热更新与 Cloudflare 静态路由。
