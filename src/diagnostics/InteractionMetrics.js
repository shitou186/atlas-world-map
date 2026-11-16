// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class InteractionMetrics {
  constructor(map, scene) {
    this.map = map;
    this.scene = scene;
    this.samples = [];
    this.tasks = [];
    this.startup = {
      mapCreatedMs: performance.now(),
    };
    for (const eventName of ['style.load', 'load']) {
      map.once(eventName, () => {
        this.startup[eventName] = performance.now();
        this.startup.resources = performance
          .getEntriesByType('resource')
          .filter(
            (resourceEntry) =>
              !resourceEntry.name.includes('/src/') &&
              !resourceEntry.name.includes('/node_modules/'),
          )
          .map((resourceEntry) => ({
            url: resourceEntry.name,
            startMs: resourceEntry.startTime,
            durationMs: resourceEntry.duration,
            bytes: resourceEntry.transferSize,
          }));
        map.getCanvas().dataset.startupMetrics = JSON.stringify(this.startup);
      });
    }
    this.output = document.createElement('output');
    this.output.id = 'interaction-metrics';
    this.output.hidden = !0;
    document.body.append(this.output);
    map.getCanvas().addEventListener(
      'mousedown',
      () => {
        this.pressed = !0;
        this.begin();
      },
      !0,
    );
    document.addEventListener(
      'mouseup',
      () => {
        this.pressed = !1;
        this.finish();
      },
      !0,
    );
    for (const eventName of ['movestart', 'moveend', 'dragstart', 'dragend', 'resize', 'click']) {
      map.on(eventName, (event) => {
        if (eventName === 'movestart') {
          this.begin();
        }
        this.record(eventName, {
          original: event.originalEvent?.type,
        });
        if (eventName === 'moveend') {
          this.finish();
        }
      });
    }
    map.on('render', () => {
      if (!this.current || this.current.frames.length >= 4096) {
        return;
      }
      const frameTime = performance.now();
      if (this.lastFrame) {
        this.current.frames.push(frameTime - this.lastFrame);
      }
      this.lastFrame = frameTime;
      this.current.sceneCpu.push(scene.lastRenderCpuMs || 0);
    });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      this.observer = new PerformanceObserver((observationList) => {
        for (const taskEntry of observationList.getEntries()) {
          this.tasks.push({
            start: taskEntry.startTime,
            duration: taskEntry.duration,
          });
        }
        this.tasks = this.tasks.slice(-80);
      });
      this.observer.observe({
        type: 'longtask',
        buffered: !1,
      });
    }
  }
  begin() {
    clearTimeout(this.timer);
    if (!this.current) {
      this.lastFrame = 0;
      this.current = {
        start: performance.now(),
        center: this.map.getCenter().toArray(),
        frames: [],
        sceneCpu: [],
        events: [],
        shadows: this.scene.shadowCount,
      };
    }
  }
  record(eventName, details = {}) {
    if (this.current && this.current.events.length < 512) {
      this.current.events.push({
        name: eventName,
        time: performance.now() - this.current.start,
        ...details,
      });
    }
  }
  // 延迟到交互停止后汇总，持续按压或地图仍在移动时保留当前采样。
  finish() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.current || this.pressed || this.map.isMoving()) {
        return;
      }
      const sample = this.current;
      this.current = null;
      const sortedFrameTimes = sample.frames
        .slice()
        .sort((firstFrameTime, secondFrameTime) => firstFrameTime - secondFrameTime);
      const sortedCpuTimes = sample.sceneCpu
        .slice()
        .sort((firstCpuTime, secondCpuTime) => firstCpuTime - secondCpuTime);
      sample.summary = {
        frameCount: sortedFrameTimes.length,
        p50: sortedFrameTimes[Math.floor(sortedFrameTimes.length * 0.5)] || 0,
        p95: sortedFrameTimes[Math.floor(sortedFrameTimes.length * 0.95)] || 0,
        max: sortedFrameTimes.at(-1) || 0,
        over50: sortedFrameTimes.filter((frameTime) => frameTime > 50).length,
        cpuP95: sortedCpuTimes[Math.floor(sortedCpuTimes.length * 0.95)] || 0,
        shadows: this.scene.shadowCount - sample.shadows,
      };
      sample.endCenter = this.map.getCenter().toArray();
      sample.longTasks = this.tasks.filter((taskEntry) => taskEntry.start >= sample.start);
      this.samples.push(sample);
      this.samples = this.samples.slice(-12);
      this.output.textContent = JSON.stringify({
        width: this.map.getCanvas().width,
        height: this.map.getCanvas().height,
        pixelRatio: this.map.getPixelRatio(),
        samples: this.samples,
      });
    }, 250);
  }
}
export { InteractionMetrics };
