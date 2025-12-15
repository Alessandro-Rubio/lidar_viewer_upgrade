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
  center: THREE.Vector3; // 🧭 centro global

  maxPoints = 100_000;
  maxDepth = 8;

  constructor(points: Float32Array, colors: Float32Array) {
    const box = new THREE.Box3();

    for (let i = 0; i < points.length; i += 3) {
      box.expandByPoint(
        new THREE.Vector3(
          points[i],
          points[i + 1],
          points[i + 2]
        )
      );
    }

    this.center = box.getCenter(new THREE.Vector3());
    this.root = this.build(box, points, colors, 0);
  }

  private build(
    box: THREE.Box3,
    points: Float32Array,
    colors: Float32Array,
    depth: number
  ): OctreeNode {

    if (
      points.length / 3 <= this.maxPoints ||
      depth >= this.maxDepth
    ) {
      return new OctreeNode(box, points, colors);
    }

    const children: OctreeNode[] = [];
    const center = box.getCenter(new THREE.Vector3());

    for (let i = 0; i < 8; i++) {
      const childBox = box.clone();

      childBox.min.x = (i & 1) ? center.x : box.min.x;
      childBox.max.x = (i & 1) ? box.max.x : center.x;

      childBox.min.y = (i & 2) ? center.y : box.min.y;
      childBox.max.y = (i & 2) ? box.max.y : center.y;

      childBox.min.z = (i & 4) ? center.z : box.min.z;
      childBox.max.z = (i & 4) ? box.max.z : center.z;

      const idx: number[] = [];

      for (let p = 0; p < points.length; p += 3) {
        if (
          childBox.containsPoint(
            new THREE.Vector3(
              points[p],
              points[p + 1],
              points[p + 2]
            )
          )
        ) {
          idx.push(p);
        }
      }

      if (idx.length === 0) continue;

      const pOut = new Float32Array(idx.length * 3);
      const cOut = new Float32Array(idx.length * 3);

      let o = 0;
      for (const i of idx) {
        pOut[o]     = points[i];
        pOut[o + 1] = points[i + 1];
        pOut[o + 2] = points[i + 2];

        cOut[o]     = colors[i];
        cOut[o + 1] = colors[i + 1];
        cOut[o + 2] = colors[i + 2];

        o += 3;
      }

      children.push(
        this.build(childBox, pOut, cOut, depth + 1)
      );
    }

    const node = new OctreeNode(
      box,
      new Float32Array(),
      new Float32Array()
    );

    node.children = children;
    return node;
  }

  collectLOD(
    camera: THREE.Camera,
    node: OctreeNode,
    outPoints: Float32Array[],
    outColors: Float32Array[]
  ) {
    // hoja → dibujar
    if (!node.children || node.children.length === 0) {
      if (node.points.length > 0) {
        outPoints.push(node.points);
        outColors.push(node.colors);
      }
      return;
    }

    const dist = node.box.distanceToPoint(camera.position);

    // LOD simple por distancia
    if (dist > 2000) {
      for (const c of node.children) {
        this.collectLOD(camera, c, outPoints, outColors);
      }
    } else {
      for (const c of node.children) {
        this.collectLOD(camera, c, outPoints, outColors);
      }
    }
  }
}
