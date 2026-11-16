// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { MapScene } from './scene/MapScene.js';
import maplibregl from 'maplibre-gl';
import { MapPresentation } from './map/MapPresentation.js';
import { ModelAssets } from './models/ModelAssets.js';
import { TrainAssets } from './models/TrainAssets.js';
import { BoatAssets } from './models/BoatAssets.js';
import { TileScheduler } from './map/TileScheduler.js';
class AtlasApp {
  constructor() {
    this.mobile = matchMedia('(max-width: 900px)');
    this.settings = document.querySelector('#settings');
    this.panelToggle = document.querySelector('#panel-toggle');
    this.setPanel(!this.mobile.matches);
    this.mobile.addEventListener('change', () => {
      this.setPanel(!this.mobile.matches);
      if (this.mobile.matches) {
        this.map
          ?.getContainer()
          .querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show');
      }
    });
    this.scene = new MapScene();
    this.places = {
      paris: [2.3355, 48.8475],
      berlin: [13.4044, 52.5195],
      amsterdam: [4.8913, 52.371],
      newyork: [-73.9914, 40.7303],
      tokyo: [139.768, 35.681],
      shanghai: [121.489, 31.239],
    };
    this.start().catch((i) =>
      this.status(`\u5730\u56FE\u8FDE\u63A5\u5931\u8D25\uFF1A${i.message}`, 'error'),
    );
  }
  async start() {
    const [styleResponse, profileModule] = await Promise.all([
      fetch('/style.json'),
      new URLSearchParams(location.search).has('profile')
        ? import('./diagnostics/InteractionMetrics.js')
        : null,
    ]);
    if (!styleResponse.ok) {
      throw new Error('底图样式不可用');
    }
    const style = await styleResponse.json();
    for (const l of style.layers) {
      if (l.type === 'fill-extrusion') {
        l.layout = {
          ...l.layout,
          visibility: 'none',
        };
      }
      if (l.type === 'background') {
        l.paint['background-color'] = '#edece5';
      }
      if (l.type === 'fill' && l.id === 'water') {
        l.paint['fill-color'] = '#a4c4bd';
      }
    }
    this.map = new maplibregl.Map({
      container: 'map',
      style: style,
      center: this.places.shanghai,
      zoom: 16.8,
      pitch: 56,
      bearing: -28,
      maxPitch: 75,
      minZoom: 1,
      maxZoom: 20,
      hash: true,
      doubleClickZoom: !matchMedia('(pointer: coarse)').matches,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      canvasContextAttributes: {
        antialias: true,
      },
      attributionControl: {
        compact: true,
        customAttribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="https://streets.gl/" target="_blank" rel="noopener">Streets GL</a>',
      },
    });
    this.map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right',
    );
    this.map.addControl(
      new maplibregl.ScaleControl({
        unit: 'metric',
      }),
      'bottom-left',
    );
    if (this.mobile.matches) {
      this.map
        .getContainer()
        .querySelector('.maplibregl-ctrl-attrib')
        .classList.remove('maplibregl-compact-show');
    }
    const canvas = this.map.getCanvas();
    for (const l of ['contextmenu', 'gesturestart', 'gesturechange']) {
      canvas.addEventListener(l, (D) => D.preventDefault(), {
        passive: false,
      });
    }
    canvas.addEventListener('pointerdown', () => {
      if (this.mobile.matches) {
        this.setPanel(false);
        document.querySelector('#feature-card').hidden = true;
      }
    });
    this.presentation = new MapPresentation(this.map, style.layers);
    const pitchInput = document.querySelector('#map-pitch');
    const pitchLabel = document.querySelector('#pitch-label');
    pitchInput.value = this.map.getPitch();
    pitchLabel.textContent = `${Math.round(this.map.getPitch())}\xB0`;
    pitchInput.disabled = this.map.getZoom() <= 15;
    pitchInput.addEventListener('input', () => {
      if (this.presentation.detailed) {
        this.savedPitch = pitchInput.valueAsNumber;
        this.map.jumpTo({
          pitch: this.savedPitch,
        });
      }
    });
    this.map.on('pitch', () => {
      const l = this.map.getPitch();
      pitchInput.value = l;
      pitchLabel.textContent = `${Math.round(l)}\xB0`;
    });
    this.map.on('pitchend', () => {
      if (this.presentation.detailed) {
        this.savedPitch = this.map.getPitch();
      }
    });
    if (profileModule) {
      this.scene.metrics = new profileModule.InteractionMetrics(this.map, this.scene);
    }
    Promise.all([
      this.map.once('style.load'),
      ModelAssets.load(),
      TrainAssets.load(),
      BoatAssets.load(),
    ])
      .then(() => {
        const l = this.map.getStyle().layers.find((D) => D.type === 'symbol');
        this.map.addLayer(this.scene, l?.id);
        this.tiles = new TileScheduler(this.map, this.scene, (D) => {
          document.querySelector('#building-count').textContent = D.buildings.toLocaleString();
          document.querySelector('#roof-count').textContent = D.roofs.toLocaleString();
          document.querySelector('#tree-count').textContent = D.trees.toLocaleString();
          document.querySelector('#road-count').textContent = D.roads.toLocaleString();
          document.querySelector('#source-note').textContent = 'OpenStreetMap · Streets GL';
          document.querySelector('#data-note').textContent = '';
          this.status(
            D.failed ||
              (D.complete ? '当前街区已加载' : '正在加载街区 ' + D.loaded + '/' + D.total),
            D.failed ? 'error' : D.complete ? '' : 'busy',
          );
        });
        this.presentation.update(true);
        if (!this.presentation.detailed && this.map.getPitch() > 0) {
          this.map.jumpTo({
            pitch: 0,
          });
        }
        document.querySelector('#traffic-motion').checked = this.scene.traffic.moving;
        this.tiles?.update();
      })
      .catch((l) =>
        this.status(`\u4E09\u7EF4\u573A\u666F\u52A0\u8F7D\u5931\u8D25\uFF1A${l.message}`, 'error'),
      );
    this.map.on('movestart', () => {
      this.tiles?.pause();
    });
    this.map.on('move', () => {
      this.presentation.update();
      pitchInput.disabled = !this.presentation.detailed;
    });
    this.map.on('zoomend', () => {
      const l = this.presentation.detailed ? (this.savedPitch ?? 56) : 0;
      if (!this.presentation.detailed && this.map.getPitch() > 0) {
        this.savedPitch = this.map.getPitch();
        this.map.easeTo({
          pitch: 0,
          duration: 350,
        });
      } else {
        if (this.presentation.detailed && this.map.getPitch() === 0) {
          this.map.easeTo({
            pitch: l,
            duration: 350,
          });
        }
      }
    });
    document.addEventListener('visibilitychange', () => {
      this.scene.revealAnimation.lastTime = null;
      if (!document.hidden) {
        this.map.triggerRepaint();
      }
    });
    this.map.on('moveend', () => {
      this.tiles?.update();
      this.tiles?.schedule();
      this.map.triggerRepaint();
    });
    this.map.on('click', (l) => this.showFeature(this.scene.pick(l.point)));
    this.map.on('error', (l) => {
      if (!this.tiles?.loaded.size) {
        this.status(
          `\u5E95\u56FE\u8D44\u6E90\u6682\u4E0D\u53EF\u7528\uFF1A${l.error.message}`,
          'error',
        );
      }
    });
    for (const l of document.querySelectorAll('[data-place]')) {
      l.addEventListener('click', () => {
        for (const D of document.querySelectorAll('[data-place]')) {
          D.classList.toggle('active', D === l);
        }
        this.map.flyTo({
          center: this.places[l.dataset.place],
          zoom: 16.8,
          pitch: 56,
          bearing: -28,
          duration: 1800,
          essential: true,
        });
        if (this.mobile.matches) {
          this.setPanel(false);
        }
      });
    }
    document.querySelector('#location-form').addEventListener('submit', (l) => {
      l.preventDefault();
      const D = document.querySelector('#location').value.trim();
      if (D) {
        if (this.mobile.matches) {
          document.querySelector('#location').blur();
        }
        this.searchLocation(D).catch((F) => {
          if (F.name !== 'AbortError') {
            document.querySelector('#location-status').textContent = '搜索服务暂不可用，请稍后重试';
          }
        });
      }
    });
    document.querySelector('#location').addEventListener('input', () => {
      this.searchController?.abort();
      document.querySelector('#location-results').hidden = true;
    });
    document.querySelector('#location').addEventListener('focus', () => {
      if (this.mobile.matches) {
        this.setPanel(false);
        document.querySelector('#feature-card').hidden = true;
      }
    });
    document.addEventListener('pointerdown', (l) => {
      if (!l.target.closest('.location-form')) {
        this.searchController?.abort();
        document.querySelector('#location-results').hidden = true;
        if (document.activeElement === document.querySelector('#location')) {
          document.activeElement.blur();
        }
      }
    });
    document.addEventListener('keydown', (l) => {
      if (l.key === 'Escape') {
        this.setPanel(false);
        this.searchController?.abort();
        document.querySelector('#location-results').hidden = true;
        document.querySelector('#feature-card').hidden = true;
        document.querySelector('#location').blur();
      }
    });
    document.querySelector('#sun-time').addEventListener('input', (l) => {
      const D = l.target.valueAsNumber;
      document.querySelector('#time-label').textContent =
        `${Math.floor(D).toString().padStart(2, '0')}:${Math.round((D % 1) * 60)
          .toString()
          .padStart(2, '0')}`;
      this.scene.setSun(D);
    });
    document
      .querySelector('#buildings')
      .addEventListener('change', (l) => this.scene.setVisible('buildings', l.target.checked));
    document
      .querySelector('#vegetation')
      .addEventListener('change', (l) => this.scene.setVisible('vegetation', l.target.checked));
    document
      .querySelector('#roads')
      .addEventListener('change', (l) => this.scene.setVisible('roads', l.target.checked));
    document
      .querySelector('#lamps')
      .addEventListener('change', (l) => this.scene.setVisible('lamps', l.target.checked));
    document.querySelector('#scene-toggle').addEventListener('click', (l) => {
      this.presentation.three = !this.presentation.three;
      this.scene.enabled = this.presentation.three;
      this.presentation.update(true);
      pitchInput.disabled = !this.presentation.detailed;
      l.currentTarget.setAttribute('aria-pressed', this.presentation.three);
      if (!this.presentation.three) {
        this.savedPitch = this.map.getPitch();
      }
      this.map.easeTo({
        pitch: this.presentation.detailed ? (this.savedPitch ?? 56) : 0,
        duration: 350,
      });
      if (this.presentation.three) {
        this.tiles?.update();
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#vector-toggle').addEventListener('click', (l) => {
      this.presentation.vector = !this.presentation.vector;
      this.presentation.update(true);
      l.currentTarget.setAttribute('aria-pressed', this.presentation.vector);
      l.currentTarget.textContent = this.presentation.vector ? '矢量底图 · 开' : '矢量底图 · 关';
    });
    document.querySelector('#traffic').addEventListener('change', (l) => {
      if (this.scene.traffic) {
        this.scene.traffic.enabled = l.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#traffic-motion').addEventListener('change', (l) => {
      if (this.scene.traffic) {
        this.scene.traffic.moving = l.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#boats').addEventListener('change', (l) => {
      if (this.scene.boats) {
        this.scene.boats.enabled = l.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#trains').addEventListener('change', (l) => {
      if (this.scene.trains) {
        this.scene.trains.enabled = l.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#motion').checked = this.scene.motion;
    document.querySelector('#motion').addEventListener('change', (l) => {
      this.scene.motion = l.target.checked;
      if (this.scene.motion) {
        this.scene.replay();
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#wind').addEventListener('change', (l) => {
      this.scene.wind = l.target.checked;
      this.map.triggerRepaint();
    });
    document.querySelector('#tree-detail').addEventListener('change', (l) => {
      this.scene.treeDetail = l.target.value;
      this.scene.lodKey = '';
      this.map.triggerRepaint();
    });
    document.querySelector('#replay').addEventListener('click', () => {
      this.scene.motion = true;
      document.querySelector('#motion').checked = true;
      this.scene.replay();
    });
    document
      .querySelector('#shadows')
      .addEventListener('change', (l) => this.scene.setShadows(l.target.checked));
    document.querySelector('#labels').addEventListener('change', (l) => {
      this.presentation.labels = l.target.checked;
      this.presentation.update(true);
    });
    this.panelToggle.addEventListener('click', () => this.setPanel(this.settings.hidden));
    document.querySelector('#close-settings').addEventListener('click', () => this.setPanel(false));
    document.querySelector('#close-feature').addEventListener('click', () => {
      document.querySelector('#feature-card').hidden = true;
    });
    document.querySelector('#retry').addEventListener('click', () => {
      this.tiles?.failed.clear();
      this.tiles?.update();
    });
  }
  setPanel(open) {
    if (!open && this.settings.contains(document.activeElement)) {
      this.panelToggle.focus({
        preventScroll: true,
      });
    }
    this.settings.hidden = !open;
    this.panelToggle.setAttribute('aria-expanded', open);
    if (open && this.mobile.matches) {
      document.querySelector('#feature-card').hidden = true;
    }
  }
  async searchLocation(query) {
    this.searchController?.abort();
    const o = new AbortController();
    this.searchController = o;
    const p = document.querySelector('#location-results');
    const x = document.querySelector('#location-status');
    const T = document.querySelector('#location-options');
    p.hidden = false;
    x.textContent = '正在搜索…';
    T.replaceChildren();
    const w = `/api/geocode?q=${encodeURIComponent(query)}`;
    const l = await fetch(w, {
      signal: o.signal,
    });
    if (!l.ok) {
      if (!o.signal.aborted) {
        x.textContent =
          l.status === 429 ? '查询过于频繁，请稍后重试' : '地点搜索暂不可用，请稍后重试';
      }
      return;
    }
    const D = await l.json();
    if (!o.signal.aborted) {
      for (const F of D) {
        const U = Number(F.lon);
        const j = Number(F.lat);
        if (
          !Number.isFinite(U) ||
          !Number.isFinite(j) ||
          Math.abs(U) > 180 ||
          Math.abs(j) > 85.05
        ) {
          continue;
        }
        const q = document.createElement('li');
        const N = document.createElement('button');
        N.type = 'button';
        N.textContent = F.display_name;
        N.addEventListener('click', () => {
          for (const J of document.querySelectorAll('[data-place]')) {
            J.classList.remove('active');
          }
          this.map.flyTo({
            center: [U, j],
            zoom: 16.8,
            pitch: 56,
            duration: 1400,
            essential: true,
          });
          document.querySelector('#location').value = '';
          x.textContent = '';
          T.replaceChildren();
          p.hidden = true;
          if (this.mobile.matches) {
            document.querySelector('#location').blur();
          }
        });
        q.append(N);
        T.append(q);
      }
      x.textContent = T.childElementCount ? '选择匹配地点' : '没有找到匹配地点';
    }
  }
  showFeature(feature) {
    const o = document.querySelector('#feature-card');
    if (((o.hidden = !feature), !feature)) {
      return;
    }
    if (this.mobile.matches) {
      this.setPanel(false);
    }
    const p = feature.properties;
    document.querySelector('#feature-name').textContent = p.name || p['addr:street'] || '建筑';
    const x = document.querySelector('#feature-properties');
    x.replaceChildren();
    const T = [
      ['高度', `${feature.height.toFixed(1)} \u7C73`],
      ['起始高度', `${feature.minHeight.toFixed(1)} \u7C73`],
      ['屋顶', feature.roofShape],
      ['数据', feature.inferred.length ? '含推算参数' : 'OSM 标注'],
      ['对象', feature.id],
    ];
    for (const [w, l] of T) {
      const D = document.createElement('dt');
      const F = document.createElement('dd');
      D.textContent = w;
      F.textContent = l;
      x.append(D, F);
    }
    document.querySelector('#feature-link').href = `https://www.openstreetmap.org/${feature.id}`;
  }
  status(message, state = '') {
    document.querySelector('#status-text').textContent = message;
    document.querySelector('#load-state').className = `load-state ${state}`;
    document.querySelector('#retry').hidden = state !== 'error';
  }
}
export { AtlasApp };
