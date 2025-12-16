import * as THREE from 'three';

export interface LoadedTile {
  id: string;
  data: Float32Array;
  meta: any;
}

export class TileLoaderService {

  private baseUrl = 'http://localhost:8000/dataset';
  private metadata: any = null;

  // ─────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────

  async loadMetadata(): Promise<any> {
    if (this.metadata) return this.metadata;

    const res = await fetch(`${this.baseUrl}/metadata`);
    this.metadata = await res.json();
    return this.metadata;
  }

  // ─────────────────────────────────────────────
  // TILE QUERY
  // ─────────────────────────────────────────────

  async requestTilesForBBox(
    min: THREE.Vector3,
    max: THREE.Vector3
  ): Promise<LoadedTile[]> {

    const url =
      `${this.baseUrl}/tiles` +
      `?min_x=${min.x}&min_y=${min.y}` +
      `&max_x=${max.x}&max_y=${max.y}`;

    const res = await fetch(url);
    const tileIds: string[] = await res.json();

    const tiles: LoadedTile[] = [];

    for (const id of tileIds) {
      const tile = await this.loadTile(id);
      tiles.push(tile);
    }

    return tiles;
  }

  // ─────────────────────────────────────────────
  // TILE LOAD
  // ─────────────────────────────────────────────

  async loadTile(id: string): Promise<LoadedTile> {

  const [binRes, metaRes] = await Promise.all([
    fetch(`${this.baseUrl}/tile/${id}`),
    fetch(`${this.baseUrl}/tile/${id}/meta`)
  ]);

  const buffer = await binRes.arrayBuffer();
  const meta = await metaRes.json();

  // VALIDACIÓN CRÍTICA
  if (!meta.origin) {
    throw new Error(`Tile ${id} sin origin`);
  }

  const data = new Float32Array(buffer);

  return {
    id,
    data,
    meta
  };
}

}
