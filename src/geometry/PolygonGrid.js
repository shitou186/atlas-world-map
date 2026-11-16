// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class PolygonGrid {
  constructor(polygons, cellSize = 32) {
    this.size = cellSize;
    this.cells = new Map();
    this.large = [];
    for (const Q of polygons) {
      const i = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
      for (const Y of Q[0]) {
        i[0] = Math.min(i[0], Y[0]);
        i[1] = Math.min(i[1], Y[1]);
        i[2] = Math.max(i[2], Y[0]);
        i[3] = Math.max(i[3], Y[1]);
      }
      const E = {
        polygon: Q,
        bounds: i,
      };
      const s = Math.floor(i[0] / cellSize);
      const w = Math.floor(i[2] / cellSize);
      const t = Math.floor(i[1] / cellSize);
      const y = Math.floor(i[3] / cellSize);
      if ((w - s + 1) * (y - t + 1) > 4096) {
        this.large.push(E);
        continue;
      }
      for (let Y = s; Y <= w; Y++) {
        for (let N = t; N <= y; N++) {
          const a = `${Y}/${N}`;
          if (!this.cells.has(a)) {
            this.cells.set(a, []);
          }
          this.cells.get(a).push(E);
        }
      }
    }
  }
  query(ring) {
    const C = [1 / 0, 1 / 0, -1 / 0, -1 / 0];
    for (const E of ring) {
      C[0] = Math.min(C[0], E[0]);
      C[1] = Math.min(C[1], E[1]);
      C[2] = Math.max(C[2], E[0]);
      C[3] = Math.max(C[3], E[1]);
    }
    const Q = new Set(this.large);
    const i = [];
    for (let E = Math.floor(C[0] / this.size); E <= Math.floor(C[2] / this.size); E++) {
      for (let s = Math.floor(C[1] / this.size); s <= Math.floor(C[3] / this.size); s++) {
        for (const w of this.cells.get(`${E}/${s}`) || []) {
          Q.add(w);
        }
      }
    }
    for (const E of Q) {
      if (
        E.bounds[0] <= C[2] &&
        E.bounds[2] >= C[0] &&
        E.bounds[1] <= C[3] &&
        E.bounds[3] >= C[1]
      ) {
        i.push(E.polygon);
      }
    }
    return i;
  }
}
export { PolygonGrid };
