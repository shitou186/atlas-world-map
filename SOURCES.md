# 资源与数据来源

- 参考界面与公开前端资源：https://101.33.207.150/osm/
- MapLibre GL JS：https://github.com/maplibre/maplibre-gl-js
- Three.js：https://github.com/mrdoob/three.js
- Streets GL：https://github.com/StrandedKitty/streets-gl
- OpenFreeMap：https://openfreemap.org/
- 地图数据：© OpenStreetMap contributors，https://www.openstreetmap.org/copyright

保留资源中的上游版权与许可声明。本仓库不为第三方资源重新授予许可。

## 源码重建与素材

`src/` 中的应用模块依据上述公开页面的应用逻辑恢复、整理并拆分，不代表上游原始工程。第三方库实现已从应用源码中移除，改由 npm 依赖构建；库自身的版权和许可文件由对应包保留。`public/` 中的地图样式、模型和纹理来自原有公开资源，作为版本管理下的输入素材保留。

新增构建依赖对应的上游项目：

- SunCalc：https://github.com/mourner/suncalc
- Earcut：https://github.com/mapbox/earcut
- polygon-clipping：https://github.com/mfogel/polygon-clipping
- Clipper JS：https://sourceforge.net/projects/jsclipper/
- Straight skeleton：https://github.com/StrandedKitty/straight-skeleton （包中包含屋顶骨架算法的 WebAssembly 实现）
- Vector tile decoder：https://github.com/mapbox/vector-tile-js
- Protocol buffers：https://github.com/mapbox/pbf

版本由锁文件固定。原有模型和纹理未重新制作或改变授权。
