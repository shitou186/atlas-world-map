// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
class MeshPacking {
  static geometry(geometry, features = null) {
    const Q = [];
    const i = [];
    const E = [];
    const s = [];
    const w = [];
    const t = new Uint32Array(
      geometry.positions.buffer,
      geometry.positions.byteOffset,
      geometry.positions.length,
    );
    const y = geometry.colors
      ? new Uint32Array(geometry.colors.buffer, geometry.colors.byteOffset, geometry.colors.length)
      : null;
    const Y = geometry.materials
      ? new Uint32Array(
          geometry.materials.buffer,
          geometry.materials.byteOffset,
          geometry.materials.length,
        )
      : null;
    const N = new Float32Array(3);
    const a = new Uint32Array(N.buffer);
    const K = [];
    const e = features || [
      {
        startTriangle: 0,
        triangleCount: geometry.positions.length / 9,
      },
    ];
    for (const G of e) {
      const J = new Map();
      G.startVertex = Q.length / 3;
      for (let S = G.startTriangle * 9; S < (G.startTriangle + G.triangleCount) * 9; S += 9) {
        const U = geometry.positions;
        const j = U[S + 3] - U[S];
        const n = U[S + 4] - U[S + 1];
        const F = U[S + 5] - U[S + 2];
        const q = U[S + 6] - U[S];
        const u = U[S + 7] - U[S + 1];
        const x = U[S + 8] - U[S + 2];
        const b = n * x - F * u;
        const m = F * q - j * x;
        const L = j * u - n * q;
        const p = Math.hypot(b, m, L) || 1;
        N[0] = b / p;
        N[1] = m / p;
        N[2] = L / p;
        for (let Z = 0; Z < 3; Z++) {
          const V = S + Z * 3;
          let z = 2166136261;
          for (let yA = 0; yA < 3; yA++) {
            z = Math.imul(z ^ t[V + yA], 16777619);
            z = Math.imul(z ^ a[yA], 16777619);
            if (y) {
              z = Math.imul(z ^ y[V + yA], 16777619);
            }
            if (Y) {
              z = Math.imul(z ^ Y[V + yA], 16777619);
            }
          }
          let DA = J.get(z);
          for (; DA !== void 0;) {
            const yA = DA * 3;
            if (
              Q[yA] === U[V] &&
              Q[yA + 1] === U[V + 1] &&
              Q[yA + 2] === U[V + 2] &&
              s[yA] === N[0] &&
              s[yA + 1] === N[1] &&
              s[yA + 2] === N[2] &&
              (!geometry.colors ||
                (i[yA] === geometry.colors[V] &&
                  i[yA + 1] === geometry.colors[V + 1] &&
                  i[yA + 2] === geometry.colors[V + 2])) &&
              (!geometry.materials ||
                (E[yA] === geometry.materials[V] &&
                  E[yA + 1] === geometry.materials[V + 1] &&
                  E[yA + 2] === geometry.materials[V + 2]))
            ) {
              break;
            }
            DA = K[DA];
          }
          if (DA === void 0) {
            DA = Q.length / 3;
            K[DA] = J.get(z);
            J.set(z, DA);
            Q.push(U[V], U[V + 1], U[V + 2]);
            s.push(N[0], N[1], N[2]);
            if (geometry.colors) {
              i.push(geometry.colors[V], geometry.colors[V + 1], geometry.colors[V + 2]);
            }
            if (geometry.materials) {
              E.push(geometry.materials[V], geometry.materials[V + 1], geometry.materials[V + 2]);
            }
          }
          w.push(DA);
        }
      }
      G.vertexCount = Q.length / 3 - G.startVertex;
    }
    geometry.positions = new Float32Array(Q);
    geometry.normals = new Float32Array(s);
    if (geometry.colors) {
      geometry.colors = new Float32Array(i);
    }
    if (geometry.materials) {
      geometry.materials = new Float32Array(E);
    }
    geometry.indices = Q.length / 3 <= 65535 ? new Uint16Array(w) : new Uint32Array(w);
    return geometry;
  }
  static pack(scene) {
    this.geometry(scene, scene.features);
    for (const Q of Object.values(scene.surfaces)) {
      this.geometry(Q);
    }
    const C = this.geometry({
      positions: scene.water,
    });
    scene.water = C.positions;
    scene.waterNormals = C.normals;
    scene.waterIndices = C.indices;
    return scene;
  }
}
export { MeshPacking };
