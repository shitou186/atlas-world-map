// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { SceneCodec } from './SceneCodec.js';
import { BufferGeometry, BufferAttribute, Box3, Vector3, Sphere } from 'three';
class ModelAssets {
  static models = null;
  static pending = null;
  static async load() {
    if (!this.pending) {
      this.pending = fetch('/models.bin').then(async (i) => {
        if (!i.ok) {
          throw new Error(`\u6A21\u578B\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\uFF1AHTTP ${i.status}`);
        }
        this.models = SceneCodec.decode(await i.arrayBuffer());
        return this.models;
      });
    }
    return this.pending;
  }
  static geometry(name) {
    if (!this.models) {
      throw new Error('模型资源尚未加载，请先完成 ModelAssets.load()。');
    }
    const o = this.models[name];
    if (!o) {
      throw new Error(`\u6A21\u578B\u8D44\u6E90\u4E0D\u5B58\u5728\uFF1A${name}`);
    }
    const p = new BufferGeometry();
    for (const [x, T] of Object.entries(o.attributes)) {
      p.setAttribute(x, new BufferAttribute(T.array, T.itemSize, T.normalized));
    }
    if (o.index) {
      p.setIndex(new BufferAttribute(o.index.array, 1, o.index.normalized));
    }
    p.boundingBox = new Box3(
      new Vector3().fromArray(o.boundingBox.min),
      new Vector3().fromArray(o.boundingBox.max),
    );
    p.boundingSphere = new Sphere(
      new Vector3().fromArray(o.boundingSphere.center),
      o.boundingSphere.radius,
    );
    return p;
  }
}
export { ModelAssets };
