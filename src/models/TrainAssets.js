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
    const [i, o] = await Promise.all([
      fetch('/models/train/models.bin'),
      new TextureLoader().loadAsync('/models/train/Textures/colormap.png'),
    ]);
    if (!i.ok) {
      throw new Error('列车模型不可用');
    }
    const p = SceneCodec.decode(await i.arrayBuffer());
    o.flipY = false;
    o.colorSpace = SRGBColorSpace;
    this.texture = o;
    for (const x of ['a', 'b', 'c']) {
      const T = p[x];
      const w = new BufferGeometry();
      for (const [l, D] of Object.entries(T.attributes)) {
        w.setAttribute(l, new BufferAttribute(D.array, D.itemSize, D.normalized));
      }
      w.setIndex(new BufferAttribute(T.index.array, 1));
      w.boundingBox = new Box3(
        new Vector3().fromArray(T.boundingBox.min),
        new Vector3().fromArray(T.boundingBox.max),
      );
      w.boundingSphere = new Sphere(
        new Vector3().fromArray(T.boundingSphere.center),
        T.boundingSphere.radius,
      );
      this.models.push({
        geometry: w,
        texture: o,
      });
    }
    return this.models;
  }
  static dispose() {
    for (const i of this.models) {
      i.geometry.dispose();
    }
    this.texture?.dispose();
    this.texture = null;
    this.models = [];
    this.pending = null;
  }
}
export { TrainAssets };
