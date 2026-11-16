// Reconstructed from the existing Atlas page; see SOURCES.md for provenance.
import { SceneAssembler } from '../geometry/SceneAssembler.js';
const assembler = new SceneAssembler();
self.onmessage = ({ data: tileRequest }) =>
  assembler
    .build(tileRequest)
    .then((sceneData) => {
      // 传输列表交出全部几何缓冲区的所有权，发送后 Worker 不再访问这些数组。
      const transferBuffers = [
        sceneData.positions.buffer,
        sceneData.colors.buffer,
        sceneData.materials.buffer,
        sceneData.normals.buffer,
        sceneData.indices.buffer,
        sceneData.water.buffer,
        sceneData.waterNormals.buffer,
        sceneData.waterIndices.buffer,
      ];
      for (const surface of Object.values(sceneData.surfaces)) {
        for (const attributeName of ['positions', 'colors', 'normals', 'indices']) {
          transferBuffers.push(surface[attributeName].buffer);
        }
      }
      for (const route of [...sceneData.traffic, ...sceneData.boats]) {
        transferBuffers.push(route.points.buffer, route.distances.buffer);
      }
      for (const railway of sceneData.railways) {
        transferBuffers.push(railway.points.buffer);
      }
      transferBuffers.push(sceneData.sleepers.buffer);
      self.postMessage(
        {
          key: tileRequest.key,
          data: sceneData,
        },
        transferBuffers,
      );
    })
    .catch((buildError) =>
      self.postMessage({
        key: tileRequest.key,
        error: buildError.message,
      }),
    );
