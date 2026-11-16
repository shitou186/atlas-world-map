// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { BufferGeometry, BufferAttribute, Color } from 'three';
class BoatAssets {
  static geometry = null;
  static pending = null;
  static load() {
    if (!this.pending) {
      this.pending = fetch('/models/boat/boat.bis').then(async (i) => {
        if (!i.ok) {
          throw new Error(`\u8239\u53EA\u6A21\u578B\u4E0D\u53EF\u7528\uFF1AHTTP ${i.status}`);
        }
        this.geometry = this.decode(await i.arrayBuffer());
        return this.geometry;
      });
    }
    return this.pending;
  }
  static decode(i) {
    const o = new Float32Array(i);
    if (o[0] !== -3 || o[3] !== 0) {
      throw new Error('船只模型格式不支持');
    }
    const p = o[1];
    const x = o[2];
    const T = 5 + Math.ceil(p / 2);
    const w = new BufferGeometry();
    w.setIndex(new BufferAttribute(new Uint16Array(i, 20, p), 1));
    w.setAttribute('position', new BufferAttribute(o.slice(T, T + x * 3), 3));
    w.setAttribute('normal', new BufferAttribute(o.slice(T + x * 3, T + x * 6), 3));
    w.rotateZ(-Math.PI / 2);
    const l = w.attributes.position;
    const D = w.attributes.normal;
    const F = new Float32Array(x * 3);
    const U = ['#225b7a', '#b8a183', '#f0eee5', '#ad4034', '#243942'].map((j) => new Color(j));
    for (let j = 0; j < x; j++) {
      const q = l.getX(j);
      const N = l.getY(j);
      const J = l.getZ(j);
      const Z =
        q < -15 && q > -22 && Math.abs(N) < 2.5 && J > 4
          ? J > 12.5
            ? 3
            : 2
          : J < 0
            ? 4
            : D.getZ(j) > 0.7
              ? 1
              : 0;
      U[Z].toArray(F, j * 3);
    }
    w.setAttribute('color', new BufferAttribute(F, 3));
    w.computeBoundingBox();
    w.computeBoundingSphere();
    return w;
  }
}
export { BoatAssets };
