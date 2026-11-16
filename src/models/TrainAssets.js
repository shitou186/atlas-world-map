// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import {
  TextureLoader,
  SRGBColorSpace,
  BufferGeometry,
  BufferAttribute,
  Box3,
  Vector3,
  Sphere,
} from 'three';
import { SceneCodec } from './SceneCodec.js';
import { assetUrl } from '../urls.js';
class TrainAssets {
  static models = [];
  static pending = null;
  static texture = null;
  static load() {
    if (!this.pending) {
      this.pending = this.read();
    }
    return this.pending;
  }
  static async read() {
    // 模型和纹理并行加载，全部就绪后再组装列车各节几何体。
    const [response, texture] = await Promise.all([
      fetch(assetUrl('/models/train/models.bin')),
      new TextureLoader().loadAsync(assetUrl('/models/train/Textures/colormap.png')),
    ]);
    if (!response.ok) {
      throw new Error('列车模型不可用');
    }
    const models = SceneCodec.decode(await response.arrayBuffer());
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    this.texture = texture;
    for (const modelName of ['a', 'b', 'c']) {
      const model = models[modelName];
      const geometry = new BufferGeometry();
      for (const [attributeName, attribute] of Object.entries(model.attributes)) {
        geometry.setAttribute(
          attributeName,
          new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized),
        );
      }
      geometry.setIndex(new BufferAttribute(model.index.array, 1));
      geometry.boundingBox = new Box3(
        new Vector3().fromArray(model.boundingBox.min),
        new Vector3().fromArray(model.boundingBox.max),
      );
      geometry.boundingSphere = new Sphere(
        new Vector3().fromArray(model.boundingSphere.center),
        model.boundingSphere.radius,
      );
      this.models.push({
        geometry: geometry,
        texture: texture,
      });
    }
    return this.models;
  }
  static dispose() {
    for (const model of this.models) {
      model.geometry.dispose();
    }
    this.texture?.dispose();
    this.texture = null;
    this.models = [];
    this.pending = null;
  }
}
export { TrainAssets };
