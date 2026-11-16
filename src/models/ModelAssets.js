// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { SceneCodec } from './SceneCodec.js';
import { assetUrl } from '../urls.js';
import { BufferGeometry, BufferAttribute, Box3, Vector3, Sphere } from 'three';
class ModelAssets {
  static models = null;
  static pending = null;
  static async load() {
    if (!this.pending) {
      this.pending = fetch(assetUrl('/models.bin')).then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `\u6A21\u578B\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25\uFF1AHTTP ${response.status}`,
          );
        }
        this.models = SceneCodec.decode(await response.arrayBuffer());
        return this.models;
      });
    }
    return this.pending;
  }
  static geometry(name) {
    if (!this.models) {
      throw new Error('模型资源尚未加载，请先完成 ModelAssets.load()。');
    }
    const model = this.models[name];
    if (!model) {
      throw new Error(`\u6A21\u578B\u8D44\u6E90\u4E0D\u5B58\u5728\uFF1A${name}`);
    }
    // 重用解码后的数组创建几何属性，并恢复预存边界供裁剪使用。
    const geometry = new BufferGeometry();
    for (const [attributeName, attribute] of Object.entries(model.attributes)) {
      geometry.setAttribute(
        attributeName,
        new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized),
      );
    }
    if (model.index) {
      geometry.setIndex(new BufferAttribute(model.index.array, 1, model.index.normalized));
    }
    geometry.boundingBox = new Box3(
      new Vector3().fromArray(model.boundingBox.min),
      new Vector3().fromArray(model.boundingBox.max),
    );
    geometry.boundingSphere = new Sphere(
      new Vector3().fromArray(model.boundingSphere.center),
      model.boundingSphere.radius,
    );
    return geometry;
  }
}
export { ModelAssets };
