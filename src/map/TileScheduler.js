// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { apiUrl } from '../urls.js';
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
    for (let workerIndex = 0; workerIndex < 2; workerIndex++) {
      const workerSlot = {
        busy: false,
      };
      this.startWorker(workerSlot);
      this.workers.push(workerSlot);
    }
    map.on('remove', () => {
      this.pause();
      this.disposed = true;
      clearTimeout(this.retryTimer);
      for (const controller of this.requests.values()) {
        controller.abort();
      }
      for (const workerSlot of this.workers) {
        workerSlot.worker.terminate();
      }
    });
  }
  startWorker(slot) {
    slot.worker?.terminate();
    slot.error = null;
    slot.worker = new Worker(new URL('../workers/geometry.worker.js', import.meta.url), {
      type: 'module',
    });
    slot.worker.onmessage = ({ data: message }) => slot.resolve?.(message);
    slot.worker.onerror = (event) => {
      slot.error = event.message;
      slot.reject?.(new Error(event.message));
    };
  }
  update() {
    if (!this.scene.enabled || this.map.getZoom() <= 15) {
      this.pause();
      return;
    }
    const center = this.map.getCenter().wrap();
    const tileCount = 65536;
    const centerX = Math.floor(((center.lng + 180) / 360) * tileCount);
    const centerY = Math.floor(
      ((1 - Math.asinh(Math.tan((center.lat * Math.PI) / 180)) / Math.PI) / 2) * tileCount,
    );
    if (
      this.center &&
      Math.min(Math.abs(centerX - this.center[0]), tileCount - Math.abs(centerX - this.center[0])) +
        Math.abs(centerY - this.center[1]) >
        16
    ) {
      // 大跨度移动开启新一代请求；取消网络任务，并在异步结果返回时校验版本。
      this.version++;
      this.pause();
      this.scene.clear();
      this.loaded.clear();
      this.ready.length = 0;
      this.upload = null;
      for (const controller of this.requests.values()) {
        controller.abort();
      }
    }
    this.center = [centerX, centerY];
    this.wanted.clear();
    const bounds = this.map.getBounds();
    const visibleTiles = [];
    const centerLongitude = this.map.getCenter().lng;
    const fractionalCenterX = ((center.lng + 180) / 360) * tileCount;
    const westTileX = Math.floor(
      fractionalCenterX + ((bounds.getWest() - centerLongitude) / 360) * tileCount,
    );
    const eastTileX = Math.floor(
      fractionalCenterX + ((bounds.getEast() - centerLongitude) / 360) * tileCount,
    );
    const northTileY = Math.max(
      0,
      Math.floor(
        ((1 -
          Math.asinh(Math.tan((Math.min(85.051128, bounds.getNorth()) * Math.PI) / 180)) /
            Math.PI) /
          2) *
          tileCount,
      ),
    );
    const southTileY = Math.min(
      tileCount - 1,
      Math.floor(
        ((1 -
          Math.asinh(Math.tan((Math.max(-85.051128, bounds.getSouth()) * Math.PI) / 180)) /
            Math.PI) /
          2) *
          tileCount,
      ),
    );
    // 横向瓦片编号跨日期变更线循环，距离仍按未环绕坐标计算以保持中心优先。
    for (let tileY = northTileY; tileY <= southTileY; tileY++) {
      for (let unwrappedTileX = westTileX; unwrappedTileX <= eastTileX; unwrappedTileX++) {
        const wrappedTileX = ((unwrappedTileX % tileCount) + tileCount) % tileCount;
        visibleTiles.push({
          key: wrappedTileX + '/' + tileY,
          x: wrappedTileX,
          y: tileY,
          distance: (unwrappedTileX - centerX) ** 2 + (tileY - centerY) ** 2,
        });
      }
    }
    visibleTiles.sort((firstTile, secondTile) => firstTile.distance - secondTile.distance);
    for (const tile of visibleTiles) {
      this.wanted.set(tile.key, tile);
    }
    for (const tileKey of this.failed.keys()) {
      if (!this.wanted.has(tileKey)) {
        this.failed.delete(tileKey);
      }
    }
    for (const [tileKey, controller] of this.requests) {
      if (!this.wanted.has(tileKey)) {
        controller.abort();
        this.requests.delete(tileKey);
      }
    }
    if (this.upload && !this.wanted.has(this.upload.key)) {
      this.scene.removeTile(this.upload.key);
      this.upload = null;
    }
    for (const tileKey of this.loaded) {
      const [tileX, tileY] = tileKey.split('/').map(Number);
      const wrappedDistance = Math.min(
        Math.abs(tileX - centerX),
        tileCount - Math.abs(tileX - centerX),
      );
      if (!(this.wanted.has(tileKey) || (wrappedDistance <= 2 && Math.abs(tileY - centerY) <= 2))) {
        this.scene.removeTile(tileKey);
        this.loaded.delete(tileKey);
      }
    }
    this.ready = this.ready.filter((tile) => this.wanted.has(tile.key));
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
    for (const [tileKey, download] of this.downloaded) {
      if (download.controller.signal.aborted || download.version !== this.version) {
        this.downloaded.delete(tileKey);
        this.requests.delete(tileKey);
      }
    }
    // 下载与几何构建分阶段调度；待上传队列达到四项时暂停新派发，已在途任务仍可完成。
    for (const tile of this.wanted.values()) {
      if (this.ready.length >= 4) {
        break;
      }
      const download = this.downloaded.get(tile.key);
      if (!download) {
        continue;
      }
      const workerSlot = this.workers.find((candidateSlot) => !candidateSlot.busy);
      if (!workerSlot) {
        break;
      }
      if (workerSlot.error) {
        this.startWorker(workerSlot);
      }
      workerSlot.busy = true;
      this.downloaded.delete(tile.key);
      this.build(tile, workerSlot, download)
        .catch((buildError) =>
          this.failure(tile, buildError, download.controller, download.version),
        )
        .finally(() => {
          workerSlot.busy = false;
          workerSlot.resolve = null;
          workerSlot.reject = null;
          if (this.requests.get(tile.key) === download.controller) {
            this.requests.delete(tile.key);
          }
          this.pump();
          this.schedule();
          this.report();
        });
    }
    for (const tile of this.wanted.values()) {
      // 网络请求上限为六个；失败最多尝试三次，重试时刻到达后才重新入队。
      if (this.ready.length >= 4 || this.requests.size >= 6) {
        break;
      }
      const failure = this.failed.get(tile.key);
      if (
        (failure && (failure.attempts >= 3 || performance.now() < failure.retryAt)) ||
        this.loaded.has(tile.key) ||
        this.requests.has(tile.key) ||
        this.upload?.key === tile.key ||
        this.ready.some((readyTile) => readyTile.key === tile.key)
      ) {
        continue;
      }
      const cachedTile = this.cache.get(tile.key);
      if (cachedTile) {
        // Map 的插入顺序充当 LRU 顺序，命中后移到末尾。
        this.cache.delete(tile.key);
        this.cache.set(tile.key, cachedTile);
        this.ready.push({
          ...tile,
          data: cachedTile.data,
          fetchMs: 0,
          cache: 'MEMORY',
        });
        continue;
      }
      const controller = new AbortController();
      const version = this.version;
      this.requests.set(tile.key, controller);
      this.load(tile, controller, version)
        .then((input) => {
          if (input) {
            this.downloaded.set(tile.key, {
              input: input,
              controller: controller,
              version: version,
            });
          }
        })
        .catch((loadError) => this.failure(tile, loadError, controller, version))
        .finally(() => {
          if (!this.downloaded.has(tile.key) && this.requests.get(tile.key) === controller) {
            this.requests.delete(tile.key);
          }
          this.pump();
          this.schedule();
          this.report();
        });
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    let nextRetryAt = 1 / 0;
    for (const [tileKey, failure] of this.failed) {
      if (this.wanted.has(tileKey) && !this.requests.has(tileKey) && failure.attempts < 3) {
        nextRetryAt = Math.min(nextRetryAt, failure.retryAt);
      }
    }
    if (Number.isFinite(nextRetryAt)) {
      this.retryTimer = setTimeout(
        () => {
          this.retryTimer = null;
          this.pump();
          this.report();
        },
        Math.max(0, nextRetryAt - performance.now()),
      );
    }
    this.schedule();
  }
  // 取消及过期结果不计入失败；有效失败按次数递增等待时间。
  failure(tile, error, controller, version) {
    if (this.disposed || controller.signal.aborted || version !== this.version) {
      return;
    }
    const attempts = (this.failed.get(tile.key)?.attempts || 0) + 1;
    this.failed.set(tile.key, {
      message: error.message,
      attempts: attempts,
      retryAt: performance.now() + attempts * 1500,
    });
  }
  async loadGreen(tile) {
    // 同一绿地源和瓦片共享进行中的 Promise；失败时移除缓存，允许后续重试。
    if (!this.greenSource) {
      const source = this.map.getSource('openmaptiles');
      this.greenSource = (
        source.tiles
          ? Promise.resolve(source)
          : fetch(source.url, {
              signal: AbortSignal.timeout(30000),
            }).then((response) => {
              if (!response.ok) {
                throw new Error('绿地数据源请求失败：HTTP ' + response.status);
              }
              return response.json();
            })
      ).catch((sourceError) => {
        throw ((this.greenSource = null), sourceError);
      });
    }
    const source = await this.greenSource;
    const zoom = Math.min(16, source.maxzoom ?? 14);
    const tileScale = 2 ** (16 - zoom);
    const tileX = Math.floor(tile.x / tileScale);
    const tileY = Math.floor(tile.y / tileScale);
    const tileUrl = source.tiles[0]
      .replace('{z}', zoom)
      .replace('{x}', tileX)
      .replace('{y}', tileY);
    if (!this.greenTiles.has(tileUrl)) {
      const download = fetch(tileUrl, {
        signal: AbortSignal.timeout(30000),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error('绿地数据请求失败：HTTP ' + response.status);
          }
          return response.arrayBuffer();
        })
        .catch((downloadError) => {
          throw (this.greenTiles.delete(tileUrl), downloadError);
        });
      for (this.greenTiles.set(tileUrl, download); this.greenTiles.size > 32;) {
        this.greenTiles.delete(this.greenTiles.keys().next().value);
      }
    }
    return {
      greenery: await this.greenTiles.get(tileUrl),
      greenX: tileX,
      greenY: tileY,
      greenZ: zoom,
      greenKey: tileUrl,
    };
  }
  async load(tile, controller, version) {
    const fetchStartedMs = performance.now();
    const [tileInput, greeneryInput] = await Promise.all([
      fetch(apiUrl('/api/tiles/16/' + tile.key), {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error('地图数据请求失败：HTTP ' + response.status);
        }
        return {
          bytes: await response.arrayBuffer(),
          cache: response.headers.get('X-Tile-Cache') || 'HTTP',
        };
      }),
      this.loadGreen(tile),
    ]);
    if (!(controller.signal.aborted || version !== this.version)) {
      return {
        ...tileInput,
        ...greeneryInput,
        fetchMs: performance.now() - fetchStartedMs,
      };
    }
  }
  async build(tile, workerSlot, { input: input, controller: controller, version: version }) {
    const {
      bytes: bytes,
      greenery: greenery,
      greenX: greenX,
      greenY: greenY,
      greenZ: greenZ,
      greenKey: greenKey,
      fetchMs: fetchMs,
      cache: cache,
    } = input;
    if (workerSlot.error) {
      throw new Error(workerSlot.error);
    }
    // 绿地缓冲区仍由共享缓存持有，必须复制后转移；建筑缓冲区可直接交给 Worker。
    const greenBytes = greenery.slice(0);
    const result = await new Promise((resolve, reject) => {
      workerSlot.resolve = resolve;
      workerSlot.reject = reject;
      workerSlot.worker.postMessage(
        {
          ...tile,
          bytes: bytes,
          greenBytes: greenBytes,
          greenX: greenX,
          greenY: greenY,
          greenZ: greenZ,
          greenKey: greenKey,
        },
        [bytes, greenBytes],
      );
    });
    // Worker 已开始的计算无法由网络取消中止，返回后丢弃取消或旧版本的结果。
    if (controller.signal.aborted || version !== this.version) {
      return;
    }
    if (result.error) {
      throw new Error(result.error);
    }
    this.failed.delete(tile.key);
    const data = result.data;
    let estimatedBytes = 0;
    for (const geometryGroup of [
      data,
      ...Object.values(data.surfaces),
      ...data.traffic,
      ...data.boats,
      ...data.railways,
    ]) {
      for (const attribute of Object.values(geometryGroup)) {
        if (ArrayBuffer.isView(attribute)) {
          estimatedBytes += attribute.byteLength;
        }
      }
    }
    // 几何缓存同时受数量和估算字节数限制，按最久未使用的顺序淘汰。
    for (
      estimatedBytes +=
        data.features.length * 512 + (data.trees.length + data.furniture.length) * 128,
        this.cache.set(tile.key, {
          data: data,
          bytes: estimatedBytes,
        }),
        this.cacheBytes += estimatedBytes;
      this.cache.size > 64 || this.cacheBytes > 128 * 1024 * 1024;
    ) {
      const oldestKey = this.cache.keys().next().value;
      this.cacheBytes -= this.cache.get(oldestKey).bytes;
      this.cache.delete(oldestKey);
    }
    if (this.wanted.has(tile.key)) {
      this.ready.push({
        ...tile,
        data: data,
        fetchMs: fetchMs,
        cache: cache,
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
        const sliceStartedMs = performance.now();
        if (!this.upload) {
          this.ready.sort(
            (firstTile, secondTile) =>
              (this.wanted.get(firstTile.key)?.distance ?? 1 / 0) -
              (this.wanted.get(secondTile.key)?.distance ?? 1 / 0),
          );
          const tile = this.ready.shift();
          if (!this.wanted.has(tile.key) || this.loaded.has(tile.key)) {
            this.schedule();
            return;
          }
          this.upload = {
            ...tile,
            generator: this.scene.prepareTile(tile.key, tile.data),
            commitMs: 0,
            maxSliceMs: 0,
          };
        }
        const upload = this.upload;
        let complete = false;
        // 每帧分片推进上传生成器，约四毫秒后让出主线程；完成后才标记瓦片已加载。
        do complete = upload.generator.next().done;
        while (!complete && performance.now() - sliceStartedMs < 4);
        const sliceMs = performance.now() - sliceStartedMs;
        upload.commitMs += sliceMs;
        upload.maxSliceMs = Math.max(upload.maxSliceMs, sliceMs);
        if (complete) {
          this.loaded.add(upload.key);
          this.upload = null;
          this.history.push({
            key: upload.key,
            fetchMs: upload.fetchMs,
            cache: upload.cache,
            commitMs: upload.commitMs,
            maxSliceMs: upload.maxSliceMs,
            generation: upload.data.timings,
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
    const features = new Map();
    let treeCount = 0;
    let roadCount = 0;
    let roofCount = 0;
    for (const tileKey of this.loaded) {
      const tileData = this.scene.tiles.get(tileKey).data;
      for (const feature of tileData.features) {
        features.set(feature.id, feature);
      }
      treeCount += tileData.trees.length;
      roadCount += tileData.landscapeStats.roads;
    }
    for (const feature of features.values()) {
      if (feature.roofShape !== 'flat') {
        roofCount++;
      }
    }
    const complete = [...this.wanted.keys()].every((tileKey) => this.loaded.has(tileKey));
    if (this.loaded.size) {
      this.firstTileMs ??= performance.now();
    }
    if (complete && this.wanted.size) {
      this.completeMs ??= performance.now();
    }
    const failureMessage = [...this.wanted.keys()]
      .map((tileKey) => this.failed.get(tileKey)?.message)
      .find(Boolean);
    this.changed({
      buildings: features.size,
      trees: treeCount,
      roads: roadCount,
      roofs: roofCount,
      complete: complete,
      failed: failureMessage,
      loaded: [...this.wanted.keys()].filter((tileKey) => this.loaded.has(tileKey)).length,
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
        building: this.workers.filter((workerSlot) => workerSlot.busy).length,
        queued: this.ready.length,
        failed: [...this.failed],
        history: this.history,
      });
    }
  }
}
export { TileScheduler };
