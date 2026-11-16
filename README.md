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
- 运行时矢量底图、字体与图标由 OpenFreeMap 提供；街区数据来自 Streets GL，地点搜索使用 Nominatim；本地与 Cloudflare 经本站代理，Pages 由浏览器直连数据源，均需联网。
- 保留 OpenStreetMap 与 Streets GL 署名；不包含独立地图数据库或参考站未公开的后台。

## 部署到自己的 Cloudflare 账号

```bash
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy
```

`pnpm run deploy` 先完整构建再部署。部署配置为 `wrangler.jsonc`，Worker 名称为 `atlas-world-map-20261116`。静态文件通过 Workers Static Assets 托管，接口通过 Worker 转发。

## 发布到 GitHub Pages

两个平台可以独立部署，各自运行，不相互调用前端或 API：

| 部署目标 | 前端托管 | 瓦片和搜索请求 |
| --- | --- | --- |
| GitHub Pages | Pages 静态资源 | 浏览器直接访问 Streets GL 和 Nominatim，不访问 Cloudflare |
| Cloudflare Workers | 当前 Worker 的 Static Assets | 当前站点 `/api/...` 由自己的 Worker 转发，不访问 Pages |
| 本地开发 / 生产服务 | Vite / Node | 当前站点 `/api/...` 由 Vite / Node 转发 |

Pages 地址：<https://shitou186.github.io/atlas-world-map/>。Pages 本身不能运行服务端代理，因此它使用数据源提供的浏览器跨域访问能力；三维地图、地点搜索及其他交互保留。两种部署都需要访问公共地图数据源，并非离线站点。

首次启用时，在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。工作流位于 [`.github/workflows/pages.yml`](./.github/workflows/pages.yml)，推送 `main` 或在 Actions 中手动运行后，会安装固定版本 pnpm 和 Node.js 22、执行测试、构建纯静态产物并发布。不需要 Cloudflare 凭据或外部 API 地址。

Pages 使用独立构建模式：

```bash
pnpm build:pages
pnpm preview:pages
```

本地预览访问 <http://localhost:4173/atlas-world-map/>。输出仍在 `dist/`，包含模型、纹理、几何 Worker、动态模块和 `/osm/` 兼容入口，不生成 Node 服务或 Cloudflare 部署目录。执行 `pnpm start`、`pnpm build` 或 `pnpm run deploy` 时，会重新构建根路径版本。

通常无需配置仓库变量。工作流自动读取 Pages 的实际站点路径，支持仓库子目录及自定义域名。如果需要覆盖，可在 **Settings → Secrets and variables → Actions → Variables** 设置 `VITE_BASE_PATH`，例如 `/atlas-world-map/` 或 `/`。手动构建自定义域名根目录版本：

```bash
VITE_BASE_PATH=/ pnpm build:pages
```

`VITE_API_BASE_URL` 已停用，遗留变量可以删除，保留也不会生效。数据访问模式由构建目标确定，避免环境变量导致两个平台混用。普通 `dev/start/build/deploy` 始终使用同源 API。

Cloudflare 的 `CORS_ALLOWED_ORIGINS` 默认留空，不向 Pages 或其他站点开放跨域代理；本站页面仍正常使用自己的接口。工作流只发布 Pages，Cloudflare 的更新单独运行 `pnpm run deploy`，两者不依赖对方先部署。

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

使用 `ATLAS_TEST_PAGES=1 pnpm test:browser` 可验证真实的 Pages 子目录静态构建：模型与纹理不越出部署目录，几何 Worker 和动态模块正常加载，瓦片与搜索直接使用数据源，并阻止对 Cloudflare Worker 的请求。测试通过固定数据隔离第三方服务波动。
