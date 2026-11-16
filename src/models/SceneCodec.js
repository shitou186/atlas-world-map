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
    const o = [];
    const p = [];
    const x = new Map();
    let T = 0;
    const w = JSON.stringify(
      {
        data: data,
        arrays: o,
      },
      (q, N) => {
        if (!ArrayBuffer.isView(N)) {
          return N;
        }
        const J = N.constructor.name;
        if (!Object.hasOwn(SCENE_ARRAY_TYPES, J)) {
          throw new TypeError(
            `\u4E0D\u652F\u6301\u7684\u573A\u666F\u6570\u7EC4\u7C7B\u578B\uFF1A${J}`,
          );
        }
        let se = x.get(N);
        if (se === void 0) {
          se = o.length;
          T = Math.ceil(T / 8) * 8;
          o.push({
            type: J,
            offset: T,
            length: N.length,
          });
          p.push(new Uint8Array(N.buffer, N.byteOffset, N.byteLength));
          x.set(N, se);
          T += N.byteLength;
        }
        return {
          $sceneArray: se,
        };
      },
    );
    const l = new TextEncoder().encode(w);
    const D = Math.ceil((SCENE_HEADER_BYTES + l.length) / 8) * 8;
    const F = D + T;
    if (F > 4294967295) {
      throw new RangeError('场景分块超过二进制格式长度上限。');
    }
    const U = new Uint8Array(F);
    const j = new DataView(U.buffer);
    U.set(SCENE_MAGIC);
    j.setUint32(8, SCENE_VERSION, true);
    j.setUint32(12, l.length, true);
    j.setUint32(16, D, true);
    j.setUint32(20, F, true);
    U.set(l, SCENE_HEADER_BYTES);
    for (let q = 0; q < o.length; q++) {
      U.set(p[q], D + o[q].offset);
    }
    return U;
  }
  static decode(input) {
    if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) {
      throw new TypeError('场景输入必须是 ArrayBuffer 或 Uint8Array。');
    }
    const o = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (o.length < SCENE_HEADER_BYTES) {
      throw new RangeError('场景二进制头不完整。');
    }
    for (let N = 0; N < SCENE_MAGIC.length; N++) {
      if (o[N] !== SCENE_MAGIC[N]) {
        throw new Error('场景二进制魔数无效。');
      }
    }
    const p = new DataView(o.buffer, o.byteOffset, SCENE_HEADER_BYTES);
    const x = p.getUint32(8, true);
    const T = p.getUint32(12, true);
    const w = p.getUint32(16, true);
    const l = p.getUint32(20, true);
    if (x !== SCENE_VERSION) {
      throw new Error(
        `\u4E0D\u652F\u6301\u7684\u573A\u666F\u4E8C\u8FDB\u5236\u7248\u672C\uFF1A${x}`,
      );
    }
    if (l !== o.length || w % 8 || w !== Math.ceil((SCENE_HEADER_BYTES + T) / 8) * 8 || w > l) {
      throw new RangeError('场景二进制长度无效。');
    }
    const D = JSON.parse(
      new TextDecoder('utf-8', {
        fatal: true,
      }).decode(o.subarray(SCENE_HEADER_BYTES, SCENE_HEADER_BYTES + T)),
    );
    if (!D || !Array.isArray(D.arrays) || !Object.hasOwn(D, 'data')) {
      throw new Error('场景数组目录无效。');
    }
    const F = o.byteOffset % 8 ? o.slice(w) : o.subarray(w);
    const U = [];
    let j = 0;
    for (const N of D.arrays) {
      if (
        !N ||
        !Object.hasOwn(SCENE_ARRAY_TYPES, N.type) ||
        !Number.isSafeInteger(N.offset) ||
        !Number.isSafeInteger(N.length) ||
        N.offset < 0 ||
        N.length < 0 ||
        N.offset % 8
      ) {
        throw new Error('场景数组描述无效。');
      }
      const J = SCENE_ARRAY_TYPES[N.type];
      const se = N.length * J.BYTES_PER_ELEMENT;
      if (
        !Number.isSafeInteger(se) ||
        N.offset < j ||
        N.offset > F.byteLength ||
        se > F.byteLength - N.offset
      ) {
        throw new RangeError('场景数组超出载荷范围。');
      }
      U.push(new J(F.buffer, F.byteOffset + N.offset, N.length));
      j = N.offset + se;
    }
    const q = (N) => {
      if (!N || typeof N != 'object') {
        return N;
      }
      if (Object.keys(N).length === 1 && Object.hasOwn(N, '$sceneArray')) {
        if (!Number.isInteger(N.$sceneArray) || N.$sceneArray < 0 || N.$sceneArray >= U.length) {
          throw new RangeError('场景数组引用无效。');
        }
        return U[N.$sceneArray];
      }
      for (const J of Object.keys(N)) {
        N[J] = q(N[J]);
      }
      return N;
    };
    return q(D.data);
  }
}
export { SceneCodec };
