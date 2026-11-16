# 武汉本地底图

用户已确定：OpenFreeMap 底图、绿地、字体、图标本地化；三维 Streets GL 和搜索继续在线；可切回原在线模式。

采用 PMTiles 区域提取和官方资源包，避免逐张抓取瓦片或下载全球 MBTiles。下载放在被 git 忽略的 map-data/wuhan，工具放 .tools，不放 public/dist，不进入 Cloudflare/Pages 产物。本地 Node 数据服务提供样式、资源和 XYZ 瓦片，Vite/Node 通过 /local-map 同源接入。在线部署默认不变。

武汉示例采用矩形范围，不宣称行政边界。UI 下拉框切换并重载页面，本地模式初始定位武汉并限制范围；URL 保存模式。缺少下载包时报出执行下载命令的提示，不自动回源。下载脚本支持重用已有完整文件、失败重试和临时文件原子替换；成功后写 manifest。工具通过固定版本官方发布包及校验文件安装。
