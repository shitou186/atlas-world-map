# Atlas · 世界地图复刻

参考：https://101.33.207.150/osm/

在线演示：https://atlas-world-map-20261116.weirdopursuer.workers.dev/

保留参考站公开前端页面、样式、MapLibre/Three.js 渲染代码及三维模型，包含城市导航、搜索、俯仰角、日光、三维建筑、植被、车辆、船只、列车、阴影与建筑档案交互。

## 本地启动

需要 Node.js 22 或更新版本，无需安装依赖。

```bash
node build.mjs
node server.mjs
```

浏览器访问 http://localhost:4173 。可使用 PORT 环境变量指定端口。

## 数据来源

- 页面和三维模型取自用户指定参考站的公开资源。
- 矢量底图、字体与图标仍由 OpenFreeMap 提供。
- 三维街区数据经服务端转发到 Streets GL 的正式域名接口；地点搜索使用 Nominatim，均需联网。
- 保留原有 OpenStreetMap 与 Streets GL 数据署名。

此项目包含复刻前端与接口转发服务，不包含参考站未公开的后台源代码或独立地图数据库。

## 部署到自己的 Cloudflare 账号

```bash
npm ci
npx wrangler login
npm run deploy
```

部署配置为 `wrangler.jsonc`，Worker 名称为 `atlas-world-map-20261116`。静态文件通过 Workers Static Assets 托管，接口通过 Worker 转发到正式域名。

## 验证

```bash
npm test
```

第三方资源及地图数据署名见 [SOURCES.md](./SOURCES.md)。
