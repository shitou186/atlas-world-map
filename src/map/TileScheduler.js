// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class TileScheduler {
  constructor(map, scene, onChange) {
    this.map = map;
    this.scene = scene;
    this.changed = onChange;
    this.loaded = new Set();
    this.wanted = new Map();
    this.requests = new Map();
    this.ready = [];
    this.failed = new Map();
    this.cache = new Map();
    this.cacheBytes = 0;
    this.upload = null;
    this.timer = null;
    this.center = null;
    this.version = 0;
    this.history = [];
    this.workers = [];
    this.greenSource = null;
    this.greenTiles = new Map();
    this.downloaded = new Map();
    this.retryTimer = null;
    this.disposed = false;
    this.startedMs = performance.now();
    this.firstTileMs = null;
    this.completeMs = null;
    for (let x = 0; x < 2; x++) {
      const T = {
        busy: false,
      };
      this.startWorker(T);
      this.workers.push(T);
    }
    map.on('remove', () => {
      this.pause();
      this.disposed = true;
      clearTimeout(this.retryTimer);
      for (const x of this.requests.values()) {
        x.abort();
      }
      for (const x of this.workers) {
        x.worker.terminate();
      }
    });
  }
  startWorker(slot) {
    slot.worker?.terminate();
    slot.error = null;
    slot.worker = new Worker(new URL('../workers/geometry.worker.js', import.meta.url), {
      type: 'module',
    });
    slot.worker.onmessage = ({ data: o }) => slot.resolve?.(o);
    slot.worker.onerror = (o) => {
      slot.error = o.message;
      slot.reject?.(new Error(o.message));
    };
  }
  update() {
    if (!this.scene.enabled || this.map.getZoom() <= 15) {
      this.pause();
      return;
    }
    const i = this.map.getCenter().wrap();
    const o = 65536;
    const p = Math.floor(((i.lng + 180) / 360) * o);
    const x = Math.floor(((1 - Math.asinh(Math.tan((i.lat * Math.PI) / 180)) / Math.PI) / 2) * o);
    if (
      this.center &&
      Math.min(Math.abs(p - this.center[0]), o - Math.abs(p - this.center[0])) +
        Math.abs(x - this.center[1]) >
        16
    ) {
      this.version++;
      this.pause();
      this.scene.clear();
      this.loaded.clear();
      this.ready.length = 0;
      this.upload = null;
      for (const N of this.requests.values()) {
        N.abort();
      }
    }
    this.center = [p, x];
    this.wanted.clear();
    const T = this.map.getBounds();
    const w = [];
    const l = this.map.getCenter().lng;
    const D = ((i.lng + 180) / 360) * o;
    const F = Math.floor(D + ((T.getWest() - l) / 360) * o);
    const U = Math.floor(D + ((T.getEast() - l) / 360) * o);
    const j = Math.max(
      0,
      Math.floor(
        ((1 - Math.asinh(Math.tan((Math.min(85.051128, T.getNorth()) * Math.PI) / 180)) / Math.PI) /
          2) *
          o,
      ),
    );
    const q = Math.min(
      o - 1,
      Math.floor(
        ((1 -
          Math.asinh(Math.tan((Math.max(-85.051128, T.getSouth()) * Math.PI) / 180)) / Math.PI) /
          2) *
          o,
      ),
    );
    for (let N = j; N <= q; N++) {
      for (let J = F; J <= U; J++) {
        const se = ((J % o) + o) % o;
        w.push({
          key: se + '/' + N,
          x: se,
          y: N,
          distance: (J - p) ** 2 + (N - x) ** 2,
        });
      }
    }
    w.sort((N, J) => N.distance - J.distance);
    for (const N of w) {
      this.wanted.set(N.key, N);
    }
    for (const N of this.failed.keys()) {
      if (!this.wanted.has(N)) {
        this.failed.delete(N);
      }
    }
    for (const [N, J] of this.requests) {
      if (!this.wanted.has(N)) {
        J.abort();
        this.requests.delete(N);
      }
    }
    if (this.upload && !this.wanted.has(this.upload.key)) {
      this.scene.removeTile(this.upload.key);
      this.upload = null;
    }
    for (const N of this.loaded) {
      const [J, se] = N.split('/').map(Number);
      const Z = Math.min(Math.abs(J - p), o - Math.abs(J - p));
      if (!(this.wanted.has(N) || (Z <= 2 && Math.abs(se - x) <= 2))) {
        this.scene.removeTile(N);
        this.loaded.delete(N);
      }
    }
    this.ready = this.ready.filter((N) => this.wanted.has(N.key));
    this.pump();
    this.schedule();
    this.report();
  }
  pause() {
    clearTimeout(this.timer);
    this.timer = null;
  }
  pump() {
    if (this.disposed || this.map.isMoving() || !this.scene.enabled || this.map.getZoom() <= 15) {
      return;
    }
    for (const [o, p] of this.downloaded) {
      if (p.controller.signal.aborted || p.version !== this.version) {
        this.downloaded.delete(o);
        this.requests.delete(o);
      }
    }
    for (const o of this.wanted.values()) {
      if (this.ready.length >= 4) {
        break;
      }
      const p = this.downloaded.get(o.key);
      if (!p) {
        continue;
      }
      const x = this.workers.find((T) => !T.busy);
      if (!x) {
        break;
      }
      if (x.error) {
        this.startWorker(x);
      }
      x.busy = true;
      this.downloaded.delete(o.key);
      this.build(o, x, p)
        .catch((T) => this.failure(o, T, p.controller, p.version))
        .finally(() => {
          x.busy = false;
          x.resolve = null;
          x.reject = null;
          if (this.requests.get(o.key) === p.controller) {
            this.requests.delete(o.key);
          }
          this.pump();
          this.schedule();
          this.report();
        });
    }
    for (const o of this.wanted.values()) {
      if (this.ready.length >= 4 || this.requests.size >= 6) {
        break;
      }
      const p = this.failed.get(o.key);
      if (
        (p && (p.attempts >= 3 || performance.now() < p.retryAt)) ||
        this.loaded.has(o.key) ||
        this.requests.has(o.key) ||
        this.upload?.key === o.key ||
        this.ready.some((l) => l.key === o.key)
      ) {
        continue;
      }
      const x = this.cache.get(o.key);
      if (x) {
        this.cache.delete(o.key);
        this.cache.set(o.key, x);
        this.ready.push({
          ...o,
          data: x.data,
          fetchMs: 0,
          cache: 'MEMORY',
        });
        continue;
      }
      const T = new AbortController();
      const w = this.version;
      this.requests.set(o.key, T);
      this.load(o, T, w)
        .then((l) => {
          if (l) {
            this.downloaded.set(o.key, {
              input: l,
              controller: T,
              version: w,
            });
          }
        })
        .catch((l) => this.failure(o, l, T, w))
        .finally(() => {
          if (!this.downloaded.has(o.key) && this.requests.get(o.key) === T) {
            this.requests.delete(o.key);
          }
          this.pump();
          this.schedule();
          this.report();
        });
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    let i = 1 / 0;
    for (const [o, p] of this.failed) {
      if (this.wanted.has(o) && !this.requests.has(o) && p.attempts < 3) {
        i = Math.min(i, p.retryAt);
      }
    }
    if (Number.isFinite(i)) {
      this.retryTimer = setTimeout(
        () => {
          this.retryTimer = null;
          this.pump();
          this.report();
        },
        Math.max(0, i - performance.now()),
      );
    }
    this.schedule();
  }
  failure(tile, error, p, x) {
    if (this.disposed || p.signal.aborted || x !== this.version) {
      return;
    }
    const T = (this.failed.get(tile.key)?.attempts || 0) + 1;
    this.failed.set(tile.key, {
      message: error.message,
      attempts: T,
      retryAt: performance.now() + T * 1500,
    });
  }
  async loadGreen(tile) {
    if (!this.greenSource) {
      const D = this.map.getSource('openmaptiles');
      this.greenSource = (
        D.tiles
          ? Promise.resolve(D)
          : fetch(D.url, {
              signal: AbortSignal.timeout(30000),
            }).then((F) => {
              if (!F.ok) {
                throw new Error('绿地数据源请求失败：HTTP ' + F.status);
              }
              return F.json();
            })
      ).catch((F) => {
        throw ((this.greenSource = null), F);
      });
    }
    const o = await this.greenSource;
    const p = Math.min(16, o.maxzoom ?? 14);
    const x = 2 ** (16 - p);
    const T = Math.floor(tile.x / x);
    const w = Math.floor(tile.y / x);
    const l = o.tiles[0].replace('{z}', p).replace('{x}', T).replace('{y}', w);
    if (!this.greenTiles.has(l)) {
      const D = fetch(l, {
        signal: AbortSignal.timeout(30000),
      })
        .then((F) => {
          if (!F.ok) {
            throw new Error('绿地数据请求失败：HTTP ' + F.status);
          }
          return F.arrayBuffer();
        })
        .catch((F) => {
          throw (this.greenTiles.delete(l), F);
        });
      for (this.greenTiles.set(l, D); this.greenTiles.size > 32;) {
        this.greenTiles.delete(this.greenTiles.keys().next().value);
      }
    }
    return {
      greenery: await this.greenTiles.get(l),
      greenX: T,
      greenY: w,
      greenZ: p,
      greenKey: l,
    };
  }
  async load(i, o, p) {
    const x = performance.now();
    const [T, w] = await Promise.all([
      fetch('/api/tiles/16/' + i.key, {
        signal: AbortSignal.any([o.signal, AbortSignal.timeout(30000)]),
      }).then(async (l) => {
        if (!l.ok) {
          throw new Error('地图数据请求失败：HTTP ' + l.status);
        }
        return {
          bytes: await l.arrayBuffer(),
          cache: l.headers.get('X-Tile-Cache') || 'HTTP',
        };
      }),
      this.loadGreen(i),
    ]);
    if (!(o.signal.aborted || p !== this.version)) {
      return {
        ...T,
        ...w,
        fetchMs: performance.now() - x,
      };
    }
  }
  async build(i, o, { input: p, controller: x, version: T }) {
    const {
      bytes: w,
      greenery: l,
      greenX: D,
      greenY: F,
      greenZ: U,
      greenKey: j,
      fetchMs: q,
      cache: N,
    } = p;
    if (o.error) {
      throw new Error(o.error);
    }
    const J = l.slice(0);
    const se = await new Promise((re, ue) => {
      o.resolve = re;
      o.reject = ue;
      o.worker.postMessage(
        {
          ...i,
          bytes: w,
          greenBytes: J,
          greenX: D,
          greenY: F,
          greenZ: U,
          greenKey: j,
        },
        [w, J],
      );
    });
    if (x.signal.aborted || T !== this.version) {
      return;
    }
    if (se.error) {
      throw new Error(se.error);
    }
    this.failed.delete(i.key);
    const Z = se.data;
    let G = 0;
    for (const re of [Z, ...Object.values(Z.surfaces), ...Z.traffic, ...Z.boats, ...Z.railways]) {
      for (const ue of Object.values(re)) {
        if (ArrayBuffer.isView(ue)) {
          G += ue.byteLength;
        }
      }
    }
    for (
      G += Z.features.length * 512 + (Z.trees.length + Z.furniture.length) * 128,
        this.cache.set(i.key, {
          data: Z,
          bytes: G,
        }),
        this.cacheBytes += G;
      this.cache.size > 64 || this.cacheBytes > 128 * 1024 * 1024;
    ) {
      const re = this.cache.keys().next().value;
      this.cacheBytes -= this.cache.get(re).bytes;
      this.cache.delete(re);
    }
    if (this.wanted.has(i.key)) {
      this.ready.push({
        ...i,
        data: Z,
        fetchMs: q,
        cache: N,
      });
    }
  }
  schedule() {
    if (!(
      this.disposed ||
      this.timer ||
      this.map.isMoving() ||
      !this.scene.enabled ||
      this.map.getZoom() <= 15 ||
      (!this.upload && !this.ready.length)
    )) {
      this.timer = setTimeout(() => {
        if (((this.timer = null), this.map.isMoving())) {
          return;
        }
        const i = performance.now();
        if (!this.upload) {
          this.ready.sort(
            (w, l) =>
              (this.wanted.get(w.key)?.distance ?? 1 / 0) -
              (this.wanted.get(l.key)?.distance ?? 1 / 0),
          );
          const T = this.ready.shift();
          if (!this.wanted.has(T.key) || this.loaded.has(T.key)) {
            this.schedule();
            return;
          }
          this.upload = {
            ...T,
            generator: this.scene.prepareTile(T.key, T.data),
            commitMs: 0,
            maxSliceMs: 0,
          };
        }
        const o = this.upload;
        let p = false;
        do p = o.generator.next().done;
        while (!p && performance.now() - i < 4);
        const x = performance.now() - i;
        o.commitMs += x;
        o.maxSliceMs = Math.max(o.maxSliceMs, x);
        if (p) {
          this.loaded.add(o.key);
          this.upload = null;
          this.history.push({
            key: o.key,
            fetchMs: o.fetchMs,
            cache: o.cache,
            commitMs: o.commitMs,
            maxSliceMs: o.maxSliceMs,
            generation: o.data.timings,
          });
          this.history = this.history.slice(-32);
          this.report();
        }
        this.map.triggerRepaint();
        this.pump();
        this.schedule();
      }, 16);
    }
  }
  report() {
    if (this.disposed) {
      return;
    }
    const i = new Map();
    let o = 0;
    let p = 0;
    let x = 0;
    for (const l of this.loaded) {
      const D = this.scene.tiles.get(l).data;
      for (const F of D.features) {
        i.set(F.id, F);
      }
      o += D.trees.length;
      p += D.landscapeStats.roads;
    }
    for (const l of i.values()) {
      if (l.roofShape !== 'flat') {
        x++;
      }
    }
    const T = [...this.wanted.keys()].every((l) => this.loaded.has(l));
    if (this.loaded.size) {
      this.firstTileMs ??= performance.now();
    }
    if (T && this.wanted.size) {
      this.completeMs ??= performance.now();
    }
    const w = [...this.wanted.keys()].map((l) => this.failed.get(l)?.message).find(Boolean);
    this.changed({
      buildings: i.size,
      trees: o,
      roads: p,
      roofs: x,
      complete: T,
      failed: w,
      loaded: [...this.wanted.keys()].filter((l) => this.loaded.has(l)).length,
      total: this.wanted.size,
    });
    if (new URLSearchParams(location.search).has('profile')) {
      this.map.getCanvas().dataset.tileMetrics = JSON.stringify({
        startedMs: this.startedMs,
        firstTileMs: this.firstTileMs,
        completeMs: this.completeMs,
        loaded: [...this.loaded],
        retained: this.scene.tiles.size,
        pending: this.requests.size,
        downloaded: this.downloaded.size,
        building: this.workers.filter((l) => l.busy).length,
        queued: this.ready.length,
        failed: [...this.failed],
        history: this.history,
      });
    }
  }
}
export { TileScheduler };
