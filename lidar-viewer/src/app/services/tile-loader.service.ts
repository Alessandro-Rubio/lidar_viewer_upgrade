import * as THREE from 'three';

interface TileMeta {
  tile_id: string;
  origin: [number, number, number];
  points: number;
}

export class TileLoaderService {

  private ws!: WebSocket;
  private scene: THREE.Scene;
  private tiles = new Map<string, THREE.Points>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  connect() {
    this.ws = new WebSocket('ws://localhost:8000/ws/tiles');
    this.ws.binaryType = 'arraybuffer';

    this.ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'tile_meta') {
          this.pendingMeta = msg;
        }
      } else {
        this.loadTile(ev.data);
      }
    };
  }

  private pendingMeta!: TileMeta;

  private loadTile(buffer: ArrayBuffer) {
    const meta = this.pendingMeta;
    if (!meta) return;

    if (this.tiles.has(meta.tile_id)) return;

    const data = new Float32Array(buffer);
    const count = data.length / 6;

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    let p = 0;
    let c = 0;

    for (let i = 0; i < data.length; i += 6) {
      pos[p++] = data[i]     + meta.origin[0];
      pos[p++] = data[i + 1] + meta.origin[1];
      pos[p++] = data[i + 2] + meta.origin[2];

      col[c++] = data[i + 3];
      col[c++] = data[i + 4];
      col[c++] = data[i + 5];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geom.computeBoundingSphere();

    const mat = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true
    });

    const pts = new THREE.Points(geom, mat);
    this.scene.add(pts);

    this.tiles.set(meta.tile_id, pts);
  }

  requestTiles(camera: THREE.Camera) {
    const pos = camera.position;

    this.ws.send(JSON.stringify({
      camera: [pos.x, pos.y, pos.z],
      max_distance: 2500,
      max_tiles: 64
    }));
  }
}
