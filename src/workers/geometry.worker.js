// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { SceneAssembler } from '../geometry/SceneAssembler.js';
const assembler = new SceneAssembler();
self.onmessage = ({ data: D }) =>
  assembler
    .build(D)
    .then((A) => {
      const C = [
        A.positions.buffer,
        A.colors.buffer,
        A.materials.buffer,
        A.normals.buffer,
        A.indices.buffer,
        A.water.buffer,
        A.waterNormals.buffer,
        A.waterIndices.buffer,
      ];
      for (const Q of Object.values(A.surfaces)) {
        for (const i of ['positions', 'colors', 'normals', 'indices']) {
          C.push(Q[i].buffer);
        }
      }
      for (const Q of [...A.traffic, ...A.boats]) {
        C.push(Q.points.buffer, Q.distances.buffer);
      }
      for (const Q of A.railways) {
        C.push(Q.points.buffer);
      }
      C.push(A.sleepers.buffer);
      self.postMessage(
        {
          key: D.key,
          data: A,
        },
        C,
      );
    })
    .catch((A) =>
      self.postMessage({
        key: D.key,
        error: A.message,
      }),
    );
