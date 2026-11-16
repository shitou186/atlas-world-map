// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class RenderMetrics {
  constructor(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.cpu = [];
    this.gpu = [];
    this.count = 0;
    this.lastPublish = 0;
  }
  begin() {
    const gl = this.gl;
    const extension = this.extension;
    if (!extension) {
      return;
    }
    // 异步回收已完成的 GPU 查询；时钟不连续时丢弃该批计时结果。
    const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
    for (let queryIndex = this.pending.length - 1; queryIndex >= 0; queryIndex--) {
      const query = this.pending[queryIndex];
      if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!disjoint) {
          this.gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1000000);
        }
        gl.deleteQuery(query);
        this.pending.splice(queryIndex, 1);
      }
    }
    // 降低采样频率并限制未完成查询数量，避免性能监测本身拖慢渲染。
    if (!(++this.count % 10 || this.pending.length >= 4)) {
      this.active = gl.createQuery();
      gl.beginQuery(extension.TIME_ELAPSED_EXT, this.active);
    }
  }
  end(cpuMs, moving, triangles, calls) {
    if (this.active) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
    this.cpu.push(cpuMs);
    this.cpu = this.cpu.slice(-240);
    this.gpu = this.gpu.slice(-120);
    const now = performance.now();
    if (now - this.lastPublish < 1000) {
      return;
    }
    this.lastPublish = now;
    const sortedCpuSamples = this.cpu
      .slice()
      .sort((firstSample, secondSample) => firstSample - secondSample);
    const sortedGpuSamples = this.gpu
      .slice()
      .sort((firstSample, secondSample) => firstSample - secondSample);
    this.canvas.dataset.renderMetrics = JSON.stringify({
      moving: moving,
      triangles: triangles,
      calls: calls,
      cpuSamples: sortedCpuSamples.length,
      cpuP50: sortedCpuSamples[Math.floor(sortedCpuSamples.length * 0.5)],
      cpuP95: sortedCpuSamples[Math.floor(sortedCpuSamples.length * 0.95)],
      gpuSupported: !!this.extension,
      gpuSamples: sortedGpuSamples.length,
      gpuP50: sortedGpuSamples[Math.floor(sortedGpuSamples.length * 0.5)] ?? null,
      gpuP95: sortedGpuSamples[Math.floor(sortedGpuSamples.length * 0.95)] ?? null,
    });
  }
}
export { RenderMetrics };
