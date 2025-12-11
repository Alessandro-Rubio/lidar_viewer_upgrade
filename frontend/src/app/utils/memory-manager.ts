// src/app/utils/memory-manager.ts
import * as THREE from 'three';

export class MemoryManager {
  disposePointCloud(points: THREE.Points) {
    try {
      const geom = points.geometry as THREE.BufferGeometry;
      geom.dispose();
      const mat = points.material as THREE.Material;
      mat.dispose();
      // remove references
      (points as any).geometry = undefined;
      (points as any).material = undefined;
    } catch (e) { /* noop */ }
  }

  destroy() {
    // cualquier limpieza adicional
  }
}
