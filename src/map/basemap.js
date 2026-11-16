export function basemapOptions(pageUrl, dataMode = import.meta.env?.VITE_DATA_MODE || 'proxy') {
  const url = new URL(pageUrl);
  const available = dataMode !== 'direct' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const local = available && url.searchParams.get('basemap') === 'local';
  return { available, local, styleUrl: local ? '/local-map/style.json' : null,
    center: local ? [114.3055, 30.5928] : null,
    bounds: local ? [[113.7, 29.9], [115.1, 31.4]] : null };
}

// MapLibre 接收内联样式时没有样式文件的基准 URL；保留模板占位符并补齐本站来源。
export function resolveLocalStyleUrls(style, pageUrl) {
  const resolved = structuredClone(style);
  const origin = new URL(pageUrl).origin;
  const absolute = url => typeof url === 'string' && url.startsWith('/') ? origin + url : url;
  if (resolved.glyphs) resolved.glyphs = absolute(resolved.glyphs);
  if (resolved.sprite) resolved.sprite = absolute(resolved.sprite);
  for (const source of Object.values(resolved.sources)) {
    if (source.url) source.url = absolute(source.url);
    if (source.tiles) source.tiles = source.tiles.map(absolute);
  }
  return resolved;
}
