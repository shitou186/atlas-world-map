// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { MapScene } from './scene/MapScene.js';
import maplibregl from 'maplibre-gl';
import { MapPresentation } from './map/MapPresentation.js';
import { ModelAssets } from './models/ModelAssets.js';
import { TrainAssets } from './models/TrainAssets.js';
import { BoatAssets } from './models/BoatAssets.js';
import { TileScheduler } from './map/TileScheduler.js';
import { assetUrl, apiUrl } from './urls.js';
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
    this.start().catch((startupError) =>
      this.status(`\u5730\u56FE\u8FDE\u63A5\u5931\u8D25\uFF1A${startupError.message}`, 'error'),
    );
  }
  async start() {
    const [styleResponse, profileModule] = await Promise.all([
      fetch(assetUrl('/style.json')),
      new URLSearchParams(location.search).has('profile')
        ? import('./diagnostics/InteractionMetrics.js')
        : null,
    ]);
    if (!styleResponse.ok) {
      throw new Error('底图样式不可用');
    }
    const style = await styleResponse.json();
    for (const styleLayer of style.layers) {
      if (styleLayer.type === 'fill-extrusion') {
        styleLayer.layout = {
          ...styleLayer.layout,
          visibility: 'none',
        };
      }
      if (styleLayer.type === 'background') {
        styleLayer.paint['background-color'] = '#edece5';
      }
      if (styleLayer.type === 'fill' && styleLayer.id === 'water') {
        styleLayer.paint['fill-color'] = '#a4c4bd';
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
    for (const eventType of ['contextmenu', 'gesturestart', 'gesturechange']) {
      canvas.addEventListener(eventType, (event) => event.preventDefault(), {
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
      const pitch = this.map.getPitch();
      pitchInput.value = pitch;
      pitchLabel.textContent = `${Math.round(pitch)}\xB0`;
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
        const firstSymbolLayer = this.map
          .getStyle()
          .layers.find((styleLayer) => styleLayer.type === 'symbol');
        this.map.addLayer(this.scene, firstSymbolLayer?.id);
        this.tiles = new TileScheduler(this.map, this.scene, (tileStatus) => {
          document.querySelector('#building-count').textContent =
            tileStatus.buildings.toLocaleString();
          document.querySelector('#roof-count').textContent = tileStatus.roofs.toLocaleString();
          document.querySelector('#tree-count').textContent = tileStatus.trees.toLocaleString();
          document.querySelector('#road-count').textContent = tileStatus.roads.toLocaleString();
          document.querySelector('#source-note').textContent = 'OpenStreetMap · Streets GL';
          document.querySelector('#data-note').textContent = '';
          this.status(
            tileStatus.failed ||
              (tileStatus.complete
                ? '当前街区已加载'
                : '正在加载街区 ' + tileStatus.loaded + '/' + tileStatus.total),
            tileStatus.failed ? 'error' : tileStatus.complete ? '' : 'busy',
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
      .catch((sceneError) =>
        this.status(
          `\u4E09\u7EF4\u573A\u666F\u52A0\u8F7D\u5931\u8D25\uFF1A${sceneError.message}`,
          'error',
        ),
      );
    this.map.on('movestart', () => {
      this.tiles?.pause();
    });
    this.map.on('move', () => {
      this.presentation.update();
      pitchInput.disabled = !this.presentation.detailed;
    });
    // 概览模式收起俯仰角，回到街区细节时恢复用户上次选择的角度。
    this.map.on('zoomend', () => {
      const targetPitch = this.presentation.detailed ? (this.savedPitch ?? 56) : 0;
      if (!this.presentation.detailed && this.map.getPitch() > 0) {
        this.savedPitch = this.map.getPitch();
        this.map.easeTo({
          pitch: 0,
          duration: 350,
        });
      } else {
        if (this.presentation.detailed && this.map.getPitch() === 0) {
          this.map.easeTo({
            pitch: targetPitch,
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
    this.map.on('click', (event) => this.showFeature(this.scene.pick(event.point)));
    this.map.on('error', (event) => {
      if (!this.tiles?.loaded.size) {
        this.status(
          `\u5E95\u56FE\u8D44\u6E90\u6682\u4E0D\u53EF\u7528\uFF1A${event.error.message}`,
          'error',
        );
      }
    });
    for (const placeButton of document.querySelectorAll('[data-place]')) {
      placeButton.addEventListener('click', () => {
        for (const candidateButton of document.querySelectorAll('[data-place]')) {
          candidateButton.classList.toggle('active', candidateButton === placeButton);
        }
        this.map.flyTo({
          center: this.places[placeButton.dataset.place],
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
    document.querySelector('#location-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = document.querySelector('#location').value.trim();
      if (query) {
        if (this.mobile.matches) {
          document.querySelector('#location').blur();
        }
        this.searchLocation(query).catch((searchError) => {
          if (searchError.name !== 'AbortError') {
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
    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.location-form')) {
        this.searchController?.abort();
        document.querySelector('#location-results').hidden = true;
        if (document.activeElement === document.querySelector('#location')) {
          document.activeElement.blur();
        }
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.setPanel(false);
        this.searchController?.abort();
        document.querySelector('#location-results').hidden = true;
        document.querySelector('#feature-card').hidden = true;
        document.querySelector('#location').blur();
      }
    });
    document.querySelector('#sun-time').addEventListener('input', (event) => {
      const sunTime = event.target.valueAsNumber;
      document.querySelector('#time-label').textContent =
        `${Math.floor(sunTime).toString().padStart(2, '0')}:${Math.round((sunTime % 1) * 60)
          .toString()
          .padStart(2, '0')}`;
      this.scene.setSun(sunTime);
    });
    document
      .querySelector('#buildings')
      .addEventListener('change', (event) =>
        this.scene.setVisible('buildings', event.target.checked),
      );
    document
      .querySelector('#vegetation')
      .addEventListener('change', (event) =>
        this.scene.setVisible('vegetation', event.target.checked),
      );
    document
      .querySelector('#roads')
      .addEventListener('change', (event) => this.scene.setVisible('roads', event.target.checked));
    document
      .querySelector('#lamps')
      .addEventListener('change', (event) => this.scene.setVisible('lamps', event.target.checked));
    document.querySelector('#scene-toggle').addEventListener('click', (event) => {
      this.presentation.three = !this.presentation.three;
      this.scene.enabled = this.presentation.three;
      this.presentation.update(true);
      pitchInput.disabled = !this.presentation.detailed;
      event.currentTarget.setAttribute('aria-pressed', this.presentation.three);
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
    document.querySelector('#vector-toggle').addEventListener('click', (event) => {
      this.presentation.vector = !this.presentation.vector;
      this.presentation.update(true);
      event.currentTarget.setAttribute('aria-pressed', this.presentation.vector);
      event.currentTarget.textContent = this.presentation.vector
        ? '矢量底图 · 开'
        : '矢量底图 · 关';
    });
    document.querySelector('#traffic').addEventListener('change', (event) => {
      if (this.scene.traffic) {
        this.scene.traffic.enabled = event.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#traffic-motion').addEventListener('change', (event) => {
      if (this.scene.traffic) {
        this.scene.traffic.moving = event.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#boats').addEventListener('change', (event) => {
      if (this.scene.boats) {
        this.scene.boats.enabled = event.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#trains').addEventListener('change', (event) => {
      if (this.scene.trains) {
        this.scene.trains.enabled = event.target.checked;
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#motion').checked = this.scene.motion;
    document.querySelector('#motion').addEventListener('change', (event) => {
      this.scene.motion = event.target.checked;
      if (this.scene.motion) {
        this.scene.replay();
      }
      this.map.triggerRepaint();
    });
    document.querySelector('#wind').addEventListener('change', (event) => {
      this.scene.wind = event.target.checked;
      this.map.triggerRepaint();
    });
    document.querySelector('#tree-detail').addEventListener('change', (event) => {
      this.scene.treeDetail = event.target.value;
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
      .addEventListener('change', (event) => this.scene.setShadows(event.target.checked));
    document.querySelector('#labels').addEventListener('change', (event) => {
      this.presentation.labels = event.target.checked;
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
    // 隐藏设置面板前转移焦点，避免键盘焦点留在不可见控件上。
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
    // 新查询取消旧请求；响应落地前再次检查取消状态，避免旧结果覆盖当前界面。
    this.searchController?.abort();
    const searchController = new AbortController();
    this.searchController = searchController;
    const resultsPanel = document.querySelector('#location-results');
    const statusLabel = document.querySelector('#location-status');
    const optionsList = document.querySelector('#location-options');
    resultsPanel.hidden = false;
    statusLabel.textContent = '正在搜索…';
    optionsList.replaceChildren();
    const requestUrl = apiUrl(`/api/geocode?q=${encodeURIComponent(query)}`);
    const response = await fetch(requestUrl, {
      signal: searchController.signal,
    });
    if (!response.ok) {
      if (!searchController.signal.aborted) {
        statusLabel.textContent =
          response.status === 429 ? '查询过于频繁，请稍后重试' : '地点搜索暂不可用，请稍后重试';
      }
      return;
    }
    const results = await response.json();
    if (!searchController.signal.aborted) {
      for (const result of results) {
        const longitude = Number(result.lon);
        const latitude = Number(result.lat);
        // 搜索结果必须落在地图支持的经纬度范围内，才允许定位。
        if (
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          Math.abs(longitude) > 180 ||
          Math.abs(latitude) > 85.05
        ) {
          continue;
        }
        const resultItem = document.createElement('li');
        const resultButton = document.createElement('button');
        resultButton.type = 'button';
        resultButton.textContent = result.display_name;
        resultButton.addEventListener('click', () => {
          for (const placeButton of document.querySelectorAll('[data-place]')) {
            placeButton.classList.remove('active');
          }
          this.map.flyTo({
            center: [longitude, latitude],
            zoom: 16.8,
            pitch: 56,
            duration: 1400,
            essential: true,
          });
          document.querySelector('#location').value = '';
          statusLabel.textContent = '';
          optionsList.replaceChildren();
          resultsPanel.hidden = true;
          if (this.mobile.matches) {
            document.querySelector('#location').blur();
          }
        });
        resultItem.append(resultButton);
        optionsList.append(resultItem);
      }
      statusLabel.textContent = optionsList.childElementCount ? '选择匹配地点' : '没有找到匹配地点';
    }
  }
  showFeature(feature) {
    const featureCard = document.querySelector('#feature-card');
    if (((featureCard.hidden = !feature), !feature)) {
      return;
    }
    if (this.mobile.matches) {
      this.setPanel(false);
    }
    const properties = feature.properties;
    document.querySelector('#feature-name').textContent =
      properties.name || properties['addr:street'] || '建筑';
    const propertiesList = document.querySelector('#feature-properties');
    propertiesList.replaceChildren();
    const propertyRows = [
      ['高度', `${feature.height.toFixed(1)} \u7C73`],
      ['起始高度', `${feature.minHeight.toFixed(1)} \u7C73`],
      ['屋顶', feature.roofShape],
      ['数据', feature.inferred.length ? '含推算参数' : 'OSM 标注'],
      ['对象', feature.id],
    ];
    for (const [propertyLabel, propertyValue] of propertyRows) {
      const termElement = document.createElement('dt');
      const descriptionElement = document.createElement('dd');
      termElement.textContent = propertyLabel;
      descriptionElement.textContent = propertyValue;
      propertiesList.append(termElement, descriptionElement);
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
