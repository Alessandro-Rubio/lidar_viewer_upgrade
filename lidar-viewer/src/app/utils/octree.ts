import * as THREE from 'three';

export class OctreeNode {
  box: THREE.Box3;
  points: Float32Array;
  colors: Float32Array;
  children: OctreeNode[] | null = null;

  constructor(
    box: THREE.Box3,
    points: Float32Array,
    colors: Float32Array
  ) {
    this.box = box;
    this.points = points;
    this.colors = colors;
  }
}

export class Octree {
  root: OctreeNode;

  MAX_POINTS_GPU = 5_000_000;
  totalPoints = 0;

  constructor() {
    this.root = new OctreeNode(
      new THREE.Box3(
        new THREE.Vector3(-1e9, -1e9, -1e9),
        new THREE.Vector3(1e9, 1e9, 1e9)
      ),
      new Float32Array(),
      new Float32Array()
    );
  }

  insertChunk(points: Float32Array, colors: Float32Array): boolean {
    const count = points.length / 3;

    if (this.totalPoints + count > this.MAX_POINTS_GPU) {
      console.warn('⛔ Chunk descartado (GPU budget)');
      return false;
    }

    this.root.points = this.concat(this.root.points, points);
    this.root.colors = this.concat(this.root.colors, colors);

    this.totalPoints += count;
    return true;
  }

  collectLOD(
    camera: THREE.Camera,
    node: OctreeNode,
    outPoints: Float32Array[],
    outColors: Float32Array[]
  ) {
    if (node.points.length > 0) {
      outPoints.push(node.points);
      outColors.push(node.colors);
    }
  }

  private concat(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }
}
