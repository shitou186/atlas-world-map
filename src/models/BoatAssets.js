// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { BufferGeometry, BufferAttribute, Color } from 'three';
import { assetUrl } from '../urls.js';
class BoatAssets {
  static geometry = null;
  static pending = null;
  static load() {
    if (!this.pending) {
      this.pending = fetch(assetUrl('/models/boat/boat.bis')).then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `\u8239\u53EA\u6A21\u578B\u4E0D\u53EF\u7528\uFF1AHTTP ${response.status}`,
          );
        }
        this.geometry = this.decode(await response.arrayBuffer());
        return this.geometry;
      });
    }
    return this.pending;
  }
  static decode(buffer) {
    const floats = new Float32Array(buffer);
    if (floats[0] !== -3 || floats[3] !== 0) {
      throw new Error('船只模型格式不支持');
    }
    const indexCount = floats[1];
    const vertexCount = floats[2];
    // 索引为 Uint16，顶点属性为 Float32；索引数量向上对齐到浮点元素边界。
    const attributeOffset = 5 + Math.ceil(indexCount / 2);
    const geometry = new BufferGeometry();
    geometry.setIndex(new BufferAttribute(new Uint16Array(buffer, 20, indexCount), 1));
    geometry.setAttribute(
      'position',
      new BufferAttribute(floats.slice(attributeOffset, attributeOffset + vertexCount * 3), 3),
    );
    geometry.setAttribute(
      'normal',
      new BufferAttribute(
        floats.slice(attributeOffset + vertexCount * 3, attributeOffset + vertexCount * 6),
        3,
      ),
    );
    geometry.rotateZ(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const colors = new Float32Array(vertexCount * 3);
    const palette = ['#225b7a', '#b8a183', '#f0eee5', '#ad4034', '#243942'].map(
      (colorHex) => new Color(colorHex),
    );
    // 在旋转后的模型坐标中，按船体区域和法线方向分配现有配色。
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      const positionX = positions.getX(vertexIndex);
      const positionY = positions.getY(vertexIndex);
      const positionZ = positions.getZ(vertexIndex);
      const colorIndex =
        positionX < -15 && positionX > -22 && Math.abs(positionY) < 2.5 && positionZ > 4
          ? positionZ > 12.5
            ? 3
            : 2
          : positionZ < 0
            ? 4
            : normals.getZ(vertexIndex) > 0.7
              ? 1
              : 0;
      palette[colorIndex].toArray(colors, vertexIndex * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
export { BoatAssets };
