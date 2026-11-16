// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
const SCENE_MAGIC = new Uint8Array([65, 84, 76, 83, 83, 67, 78, 69]);
const SCENE_VERSION = 1;
const SCENE_HEADER_BYTES = 24;
const SCENE_ARRAY_TYPES = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};
class SceneCodec {
  static encode(data) {
    const arrayDescriptors = [];
    const arrayPayloads = [];
    const arrayReferences = new Map();
    let payloadBytes = 0;
    const metadataJson = JSON.stringify(
      {
        data: data,
        arrays: arrayDescriptors,
      },
      (propertyName, value) => {
        if (!ArrayBuffer.isView(value)) {
          return value;
        }
        const arrayType = value.constructor.name;
        if (!Object.hasOwn(SCENE_ARRAY_TYPES, arrayType)) {
          throw new TypeError(
            `\u4E0D\u652F\u6301\u7684\u573A\u666F\u6570\u7EC4\u7C7B\u578B\uFF1A${arrayType}`,
          );
        }
        // 相同数组对象只写入一次，JSON 中保存目录索引；载荷按八字节对齐。
        let arrayIndex = arrayReferences.get(value);
        if (arrayIndex === void 0) {
          arrayIndex = arrayDescriptors.length;
          payloadBytes = Math.ceil(payloadBytes / 8) * 8;
          arrayDescriptors.push({
            type: arrayType,
            offset: payloadBytes,
            length: value.length,
          });
          arrayPayloads.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
          arrayReferences.set(value, arrayIndex);
          payloadBytes += value.byteLength;
        }
        return {
          $sceneArray: arrayIndex,
        };
      },
    );
    const metadataBytes = new TextEncoder().encode(metadataJson);
    const payloadOffset = Math.ceil((SCENE_HEADER_BYTES + metadataBytes.length) / 8) * 8;
    const totalBytes = payloadOffset + payloadBytes;
    if (totalBytes > 4294967295) {
      throw new RangeError('场景分块超过二进制格式长度上限。');
    }
    const output = new Uint8Array(totalBytes);
    const header = new DataView(output.buffer);
    output.set(SCENE_MAGIC);
    header.setUint32(8, SCENE_VERSION, true);
    header.setUint32(12, metadataBytes.length, true);
    header.setUint32(16, payloadOffset, true);
    header.setUint32(20, totalBytes, true);
    output.set(metadataBytes, SCENE_HEADER_BYTES);
    for (let arrayIndex = 0; arrayIndex < arrayDescriptors.length; arrayIndex++) {
      output.set(arrayPayloads[arrayIndex], payloadOffset + arrayDescriptors[arrayIndex].offset);
    }
    return output;
  }
  static decode(input) {
    if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) {
      throw new TypeError('场景输入必须是 ArrayBuffer 或 Uint8Array。');
    }
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.length < SCENE_HEADER_BYTES) {
      throw new RangeError('场景二进制头不完整。');
    }
    for (let magicIndex = 0; magicIndex < SCENE_MAGIC.length; magicIndex++) {
      if (bytes[magicIndex] !== SCENE_MAGIC[magicIndex]) {
        throw new Error('场景二进制魔数无效。');
      }
    }
    const header = new DataView(bytes.buffer, bytes.byteOffset, SCENE_HEADER_BYTES);
    const version = header.getUint32(8, true);
    const metadataLength = header.getUint32(12, true);
    const payloadOffset = header.getUint32(16, true);
    const totalBytes = header.getUint32(20, true);
    if (version !== SCENE_VERSION) {
      throw new Error(
        `\u4E0D\u652F\u6301\u7684\u573A\u666F\u4E8C\u8FDB\u5236\u7248\u672C\uFF1A${version}`,
      );
    }
    // 先校验头部声明与实际长度、对齐关系，避免目录解析越过有效载荷。
    if (
      totalBytes !== bytes.length ||
      payloadOffset % 8 ||
      payloadOffset !== Math.ceil((SCENE_HEADER_BYTES + metadataLength) / 8) * 8 ||
      payloadOffset > totalBytes
    ) {
      throw new RangeError('场景二进制长度无效。');
    }
    const metadata = JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
      }).decode(bytes.subarray(SCENE_HEADER_BYTES, SCENE_HEADER_BYTES + metadataLength)),
    );
    if (!metadata || !Array.isArray(metadata.arrays) || !Object.hasOwn(metadata, 'data')) {
      throw new Error('场景数组目录无效。');
    }
    // 未对齐的外部 Uint8Array 先复制载荷，确保所有类型数组的视图地址合法。
    const payload =
      bytes.byteOffset % 8 ? bytes.slice(payloadOffset) : bytes.subarray(payloadOffset);
    const arrays = [];
    let previousArrayEnd = 0;
    for (const descriptor of metadata.arrays) {
      if (
        !descriptor ||
        !Object.hasOwn(SCENE_ARRAY_TYPES, descriptor.type) ||
        !Number.isSafeInteger(descriptor.offset) ||
        !Number.isSafeInteger(descriptor.length) ||
        descriptor.offset < 0 ||
        descriptor.length < 0 ||
        descriptor.offset % 8
      ) {
        throw new Error('场景数组描述无效。');
      }
      // 目录必须顺序排列且互不重叠，长度计算与剩余载荷都需通过边界校验。
      const ArrayType = SCENE_ARRAY_TYPES[descriptor.type];
      const arrayBytes = descriptor.length * ArrayType.BYTES_PER_ELEMENT;
      if (
        !Number.isSafeInteger(arrayBytes) ||
        descriptor.offset < previousArrayEnd ||
        descriptor.offset > payload.byteLength ||
        arrayBytes > payload.byteLength - descriptor.offset
      ) {
        throw new RangeError('场景数组超出载荷范围。');
      }
      arrays.push(
        new ArrayType(payload.buffer, payload.byteOffset + descriptor.offset, descriptor.length),
      );
      previousArrayEnd = descriptor.offset + arrayBytes;
    }
    // 只将单一标记对象还原为共享数组视图，普通对象继续递归保留原结构。
    const restoreArrays = (value) => {
      if (!value || typeof value != 'object') {
        return value;
      }
      if (Object.keys(value).length === 1 && Object.hasOwn(value, '$sceneArray')) {
        if (
          !Number.isInteger(value.$sceneArray) ||
          value.$sceneArray < 0 ||
          value.$sceneArray >= arrays.length
        ) {
          throw new RangeError('场景数组引用无效。');
        }
        return arrays[value.$sceneArray];
      }
      for (const propertyName of Object.keys(value)) {
        value[propertyName] = restoreArrays(value[propertyName]);
      }
      return value;
    };
    return restoreArrays(metadata.data);
  }
}
export { SceneCodec };
