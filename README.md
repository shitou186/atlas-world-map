# Atlas · 世界地图

用 MapLibre 和 Three.js，包含城市导航、地点搜索、俯仰角、日光、三维建筑与屋顶、植被、道路、路灯、车辆、船只、列车、阴影、入场动画与建筑档案交互。

## 安装与本地启动

需要 Node.js **22.12 或更新版本**，首次使用先安装依赖：

```bash
pnpm install --frozen-lockfile
pnpm start
```

浏览器访问 http://localhost:4173 。可使用 `PORT` 环境变量指定端口。`pnpm start` 会先从源码构建，再启动本地服务，不依赖已有 `dist`。

## 开发与热更新

```bash
pnpm dev
```

浏览器访问 http://localhost:5173 。开发模式直接读取 `index.html`、`src/` 和 `public/`，无需先构建，也不依赖 `dist/` 或 `cloudflare/`。

修改 CSS 会直接热替换；修改应用 JS、页面结构或几何 Worker 后，Vite 会自动更新或刷新页面。应用 JS 和 Worker 更新时可能重建地图并重置当前视角。

开发服务将 `/api/tiles/16/{x}/{y}` 转发到 Streets GL，将 `/api/geocode?q=...` 转发到 Nominatim，保留中文搜索、JSON 参数与服务端请求头。底图和在线数据仍需联网。

指定其他端口可运行 `pnpm dev --port 5174`。日常修改使用 `pnpm dev`；需要检查生产构建时使用 `pnpm start`。

## 完整构建

```bash
pnpm build
```

构建输入是根目录 `index.html`、`src/`、`public/` 和已安装的 npm 依赖。Vite 编译应用、样式、几何 Worker 及动态模块，然后生成本地服务入口及 Cloudflare 部署文件：

```text
index.html               页面结构与控件
src/AtlasApp.js           页面控制、搜索、城市导航
src/map/                 底图显示与瓦片调度
src/scene/               Three.js 场景、植被、车辆、船舶、列车与动画
src/geometry/            建筑/屋顶、道路、地表、街道设施与矢量瓦片处理
src/routes/              车辆、船舶、列车路线
src/models/              模型加载与场景二进制格式
src/workers/             几何计算 Worker 入口
src/styles.css           页面样式
public/                  地图样式、模型与纹理等输入素材
handler.mjs              静态资源及地图/搜索接口处理
dev-proxy.mjs            开发模式地图瓦片与搜索接口转发
build.mjs                前端构建及本地服务打包
prepare-cloudflare.mjs   Cloudflare 部署文件生成
```

`dist/` 和 `cloudflare/` 都是生成目录，可以删除后重新运行 `pnpm build` 或 `pnpm start`。`public/` 是构建所需的输入素材，请保留。地图样式和模型会原样复制到输出目录；JS、CSS 和 Worker 会重新编译，文件名由构建工具生成。

这份源码由现有页面的应用逻辑整理重建，包含模块拆分、类与接口命名、控制流程展开及第三方依赖替换，并非找回了上游原始源码。局部变量已按几何、调度和渲染职责整理命名，关键算法附有中文注释。模型和纹理保留原资源格式，不包含上游建模工程。模块入口、坐标与数据格式约定见 [源码维护说明](./docs/源码维护说明.md)。

## 数据来源

- 页面结构、样式、应用算法和三维素材依据用户指定参考站的公开页面整理。
- MapLibre、Three.js、SunCalc、Earcut、几何裁剪、矢量瓦片与屋顶骨架算法通过固定版本 npm 依赖提供，版本见 `package.json` 和 `pnpm-lock.yaml`。
- 构建阶段不请求原站或下载地图数据；首次安装依赖需要访问包仓库。
- 运行时矢量底图、字体与图标由 OpenFreeMap 提供；街区数据经服务端转发到 Streets GL，地点搜索使用 Nominatim，均需联网。
- 保留 OpenStreetMap 与 Streets GL 署名；不包含独立地图数据库或参考站未公开的后台。

## 部署到自己的 Cloudflare 账号

```bash
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy
```

`pnpm run deploy` 先完整构建再部署。部署配置为 `wrangler.jsonc`，Worker 名称为 `atlas-world-map-20261116`。静态文件通过 Workers Static Assets 托管，接口通过 Worker 转发。

## 发布到 GitHub Pages

Pages 只托管静态前端，瓦片与搜索由已有 Cloudflare Worker 提供：

- Pages 地址：<https://shitou186.github.io/atlas-world-map/>
- 默认 API：<https://atlas-world-map-20261116.weirdopursuer.workers.dev>

首次启用时，在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。工作流位于 [`.github/workflows/pages.yml`](./.github/workflows/pages.yml)，推送 `main` 或在 Actions 中手动运行后，会安装固定版本 pnpm 和 Node.js 22、执行测试、构建纯静态产物并发布。默认不需要填写额外 Token。

Pages 使用独立构建模式：

```bash
pnpm build:pages
pnpm preview:pages
```

本地预览访问 <http://localhost:4173/atlas-world-map/>。输出仍在 `dist/`，包含模型、纹理、Worker、动态模块和 `/osm/` 兼容入口，不生成 Node 服务或 Cloudflare 部署目录。执行 `pnpm start`、`pnpm build` 或 `pnpm run deploy` 时，会重新构建根路径版本。

可在仓库 **Settings → Secrets and variables → Actions → Variables** 配置以下公开变量：

| 变量 | 默认行为 | 用途 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 沿用上面的 Worker 地址 | API 服务根地址，必须为 HTTPS，不带 `/api` 后缀；可包含网关路径前缀 |
| `VITE_BASE_PATH` | 工作流读取 Pages 的实际路径 | 通常无需填写；仓库站点为 `/atlas-world-map/`，自定义域名根目录为 `/` |

手动构建可通过环境变量覆盖，例如：

```bash
VITE_BASE_PATH=/ VITE_API_BASE_URL=https://your-worker.workers.dev pnpm build:pages
```

本机默认的 `build:pages` 使用 `/atlas-world-map/`，自动工作流则使用 GitHub Pages 返回的路径，兼容自定义域名。普通 `dev/start/build/deploy` 固定使用根路径和同源 API，不受这些 Pages 变量影响。`VITE_*` 会写入浏览器代码，不能放密钥。

### Pages 与 Worker 的跨域配置

Worker 的 `CORS_ALLOWED_ORIGINS` 位于 `wrangler.jsonc`，默认允许 `https://shitou186.github.io`，以及本地 Pages 预览使用的 `http://localhost:4173`、`http://127.0.0.1:4173`。这是来源域名，**不能加 `/atlas-world-map/` 路径**。多个来源用逗号分隔；换用自定义域名或其他预览端口时需追加它的完整来源，例如 `https://maps.example.com`，并重新部署 Worker。

```bash
pnpm run deploy
```

Worker 对允许来源的 GET、HEAD、OPTIONS 返回 CORS 头，包含二进制瓦片、搜索结果和接口错误响应。同源请求及没有 Origin 头的服务端调用保留原有行为。首次发布或修改 CORS 后，应先更新这个 Worker，再使用 Pages 前端。

仓库自动工作流只发布 Pages，不需要 Cloudflare 凭据，也不会自动修改 Worker。Worker 的更新仍使用现有 `pnpm run deploy` 流程。

GitHub 官方的 [自定义 Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 与 [Vite 部署说明](https://vite.dev/guide/static-deploy.html#github-pages) 可用于排查站点设置和部署权限。

## 验证

```bash
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm test` 包括接口测试、开发服务与代理集成测试、二进制格式和几何算法测试，以及**排除 dist/cloudflare 的临时源码副本完整构建测试**。开发代理测试启动本地服务检查瓦片二进制、中文搜索参数、请求头及上游故障响应。浏览器测试启动生产构建，使用固定的矢量瓦片和搜索结果，验证真实 Worker、屋顶生成、三维渲染、控件和移动端布局，不依赖第三方地图服务在线。

可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已有 Chromium 可执行文件。测试结束会关闭临时服务。

使用 `ATLAS_TEST_DEV=1 pnpm test:browser` 可改为验证开发服务，包括 CSS/JS 热更新以及同一套三维地图和移动端回归。

第三方资源及地图数据署名见 [SOURCES.md](./SOURCES.md)。

使用 `ATLAS_TEST_PAGES=1 pnpm test:browser` 可验证真实的 Pages 子目录静态构建：模型与纹理不越出部署目录，几何 Worker 和动态模块正常加载，瓦片与搜索使用独立 API 地址。测试通过固定数据隔离第三方服务波动。
