// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class PolygonGrid {
  constructor(polygons, cellSize = 32) {
    this.size = cellSize;
    this.cells = new Map();
    this.large = [];
    for (const polygon of polygons) {
      const bounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
      for (const point of polygon[0]) {
        bounds[0] = Math.min(bounds[0], point[0]);
        bounds[1] = Math.min(bounds[1], point[1]);
        bounds[2] = Math.max(bounds[2], point[0]);
        bounds[3] = Math.max(bounds[3], point[1]);
      }
      const entry = {
        polygon: polygon,
        bounds: bounds,
      };
      const minCellX = Math.floor(bounds[0] / cellSize);
      const maxCellX = Math.floor(bounds[2] / cellSize);
      const minCellY = Math.floor(bounds[1] / cellSize);
      const maxCellY = Math.floor(bounds[3] / cellSize);
      // 超过 4096 格的面单独保存，限制索引体积；查询时仍将其纳入候选。
      if ((maxCellX - minCellX + 1) * (maxCellY - minCellY + 1) > 4096) {
        this.large.push(entry);
        continue;
      }
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
          const cellKey = `${cellX}/${cellY}`;
          if (!this.cells.has(cellKey)) {
            this.cells.set(cellKey, []);
          }
          this.cells.get(cellKey).push(entry);
        }
      }
    }
  }
  query(ring) {
    const bounds = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
    for (const point of ring) {
      bounds[0] = Math.min(bounds[0], point[0]);
      bounds[1] = Math.min(bounds[1], point[1]);
      bounds[2] = Math.max(bounds[2], point[0]);
      bounds[3] = Math.max(bounds[3], point[1]);
    }
    // 同一多边形可能出现在多个网格，先去重，再以包围盒筛选实际候选。
    const candidates = new Set(this.large);
    const polygons = [];
    for (
      let cellX = Math.floor(bounds[0] / this.size);
      cellX <= Math.floor(bounds[2] / this.size);
      cellX++
    ) {
      for (
        let cellY = Math.floor(bounds[1] / this.size);
        cellY <= Math.floor(bounds[3] / this.size);
        cellY++
      ) {
        for (const entry of this.cells.get(`${cellX}/${cellY}`) || []) {
          candidates.add(entry);
        }
      }
    }
    for (const entry of candidates) {
      if (
        entry.bounds[0] <= bounds[2] &&
        entry.bounds[2] >= bounds[0] &&
        entry.bounds[1] <= bounds[3] &&
        entry.bounds[3] >= bounds[1]
      ) {
        polygons.push(entry.polygon);
      }
    }
    return polygons;
  }
}
export { PolygonGrid };
