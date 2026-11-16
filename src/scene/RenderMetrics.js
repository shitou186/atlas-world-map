// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class RenderMetrics {
  constructor(i, o) {
    this.gl = i;
    this.canvas = o;
    this.extension = i.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.cpu = [];
    this.gpu = [];
    this.count = 0;
    this.lastPublish = 0;
  }
  begin() {
    const i = this.gl;
    const o = this.extension;
    if (!o) {
      return;
    }
    const p = i.getParameter(o.GPU_DISJOINT_EXT);
    for (let x = this.pending.length - 1; x >= 0; x--) {
      const T = this.pending[x];
      if (i.getQueryParameter(T, i.QUERY_RESULT_AVAILABLE)) {
        if (!p) {
          this.gpu.push(i.getQueryParameter(T, i.QUERY_RESULT) / 1000000);
        }
        i.deleteQuery(T);
        this.pending.splice(x, 1);
      }
    }
    if (!(++this.count % 10 || this.pending.length >= 4)) {
      this.active = i.createQuery();
      i.beginQuery(o.TIME_ELAPSED_EXT, this.active);
    }
  }
  end(i, o, p, x) {
    if (this.active) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
    this.cpu.push(i);
    this.cpu = this.cpu.slice(-240);
    this.gpu = this.gpu.slice(-120);
    const T = performance.now();
    if (T - this.lastPublish < 1000) {
      return;
    }
    this.lastPublish = T;
    const w = this.cpu.slice().sort((D, F) => D - F);
    const l = this.gpu.slice().sort((D, F) => D - F);
    this.canvas.dataset.renderMetrics = JSON.stringify({
      moving: o,
      triangles: p,
      calls: x,
      cpuSamples: w.length,
      cpuP50: w[Math.floor(w.length * 0.5)],
      cpuP95: w[Math.floor(w.length * 0.95)],
      gpuSupported: !!this.extension,
      gpuSamples: l.length,
      gpuP50: l[Math.floor(l.length * 0.5)] ?? null,
      gpuP95: l[Math.floor(l.length * 0.95)] ?? null,
    });
  }
}
export { RenderMetrics };
