// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class MapPresentation {
  constructor(map, layers) {
    this.map = map;
    this.layers = layers.filter((p) => p.type !== 'background');
    this.detailed = false;
    this.labels = true;
    this.vector = true;
    this.three = true;
  }
  update(force = false) {
    const o = this.three && this.map.getZoom() > 15;
    if (!(!force && o === this.detailed)) {
      this.detailed = o;
      for (const p of this.layers) {
        const x =
          this.vector &&
          (p.type === 'symbol'
            ? this.labels
            : !o || (['fill', 'line'].includes(p.type) && p['source-layer'] !== 'building'));
        this.map.setLayoutProperty(
          p.id,
          'visibility',
          x ? p.layout?.visibility || 'visible' : 'none',
        );
        if (p.type === 'line' && p['source-layer'] === 'transportation') {
          this.map.setPaintProperty(
            p.id,
            'line-color',
            o ? (/casing/.test(p.id) ? '#d5d3c8' : '#858989') : p.paint['line-color'],
          );
        }
        if (p.type === 'fill' && p['source-layer'] === 'water') {
          this.map.setPaintProperty(p.id, 'fill-color', o ? '#90a0b7' : p.paint['fill-color']);
        }
      }
      this.map.getCanvas().dataset.groundMode = this.vector ? (o ? 'scene' : 'overview') : 'hidden';
      this.map.getCanvas().dataset.viewMode = o ? '3d' : '2d';
    }
  }
}
export { MapPresentation };
