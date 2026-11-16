// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class MapPresentation {
  constructor(map, layers) {
    this.map = map;
    this.layers = layers.filter((layer) => layer.type !== 'background');
    this.detailed = false;
    this.labels = true;
    this.vector = true;
    this.three = true;
  }
  update(force = false) {
    // 缩放阈值和三维开关共同决定底图样式；强制刷新用于图层开关变化。
    const detailed = this.three && this.map.getZoom() > 15;
    if (!(!force && detailed === this.detailed)) {
      this.detailed = detailed;
      for (const layer of this.layers) {
        const visible =
          this.vector &&
          (layer.type === 'symbol'
            ? this.labels
            : !detailed ||
              (['fill', 'line'].includes(layer.type) && layer['source-layer'] !== 'building'));
        this.map.setLayoutProperty(
          layer.id,
          'visibility',
          visible ? layer.layout?.visibility || 'visible' : 'none',
        );
        if (layer.type === 'line' && layer['source-layer'] === 'transportation') {
          this.map.setPaintProperty(
            layer.id,
            'line-color',
            detailed
              ? /casing/.test(layer.id)
                ? '#d5d3c8'
                : '#858989'
              : layer.paint['line-color'],
          );
        }
        if (layer.type === 'fill' && layer['source-layer'] === 'water') {
          this.map.setPaintProperty(
            layer.id,
            'fill-color',
            detailed ? '#90a0b7' : layer.paint['fill-color'],
          );
        }
      }
      this.map.getCanvas().dataset.groundMode = this.vector
        ? detailed
          ? 'scene'
          : 'overview'
        : 'hidden';
      this.map.getCanvas().dataset.viewMode = detailed ? '3d' : '2d';
    }
  }
}
export { MapPresentation };
