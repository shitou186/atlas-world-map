export const WUHAN = Object.freeze({
  // 武汉及周边示例矩形，覆盖城区和近郊，不是行政边界。
  bounds: [113.7, 29.9, 115.1, 31.4],
  center: [114.3055, 30.5928],
  maxzoom: 14,
});

export function selectPlanetArchive(index) {
  const paths = new Set(index.split(/\r?\n/));
  const versions = [...paths].filter(path => /^areas\/planet\/[^/]+\/tiles\.pmtiles$/.test(path)
    && paths.has(path.replace('tiles.pmtiles', 'done'))).sort();
  if (!versions.length) throw new Error('官方索引中没有完整的全球 PMTiles 发布');
  return `https://btrfs.openfreemap.com/${versions.at(-1)}`;
}

export function localizeStyle(online, maxzoom = WUHAN.maxzoom) {
  const style = structuredClone(online);
  style.sources.openmaptiles = {
    type: 'vector', tiles: ['/local-map/tiles/{z}/{x}/{y}.mvt'],
    minzoom: 0, maxzoom, bounds: WUHAN.bounds,
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles © OpenStreetMap contributors',
  };
  style.sources.ne2_shaded.tiles = ['/local-map/natural_earth/ofm/ne2sr/{z}/{x}/{y}.png'];
  style.glyphs = '/local-map/fonts/ofm/{fontstack}/{range}.pbf';
  style.sprite = '/local-map/sprites/ofm_f384/ofm';
  return style;
}

export function resolveTileSource({ hasTiles, plannedSource, previousSource, index }) {
  if (!hasTiles) return selectPlanetArchive(index);
  const source = plannedSource || previousSource;
  if (!source) throw new Error('已有瓦片文件缺少来源记录，请移走该文件后重新下载');
  return source;
}
