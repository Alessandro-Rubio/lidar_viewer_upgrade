import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as THREE from 'three';
import { firstValueFrom } from 'rxjs';

export interface LoadedTile {
  id: string;
  data: Float32Array;
  meta: any;
}

@Injectable({
  providedIn: 'root'
})
export class TileLoaderService {

  private baseUrl = 'http://localhost:8000/dataset';

  private metadata: any = null;
  private tileCache = new Map<string, LoadedTile>();

  constructor(private http: HttpClient) {}

  // ─────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────
  async loadMetadata(): Promise<any> {
    if (this.metadata) return this.metadata;

    this.metadata = await firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/metadata`)
    );

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

    const tileIds = await firstValueFrom(
      this.http.get<string[]>(url)
    );

    const result: LoadedTile[] = [];

    for (const id of tileIds) {
      if (this.tileCache.has(id)) {
        result.push(this.tileCache.get(id)!);
        continue;
      }

      const tile = await this.loadTile(id);
      this.tileCache.set(id, tile);
      result.push(tile);
    }

    return result;
  }

  // ─────────────────────────────────────────────
  // TILE LOAD
  // ─────────────────────────────────────────────
  private async loadTile(id: string): Promise<LoadedTile> {

    const buffer = await firstValueFrom(
      this.http.get(
        `${this.baseUrl}/tile/${id}`,
        { responseType: 'arraybuffer' }
      )
    );

    const meta = this.metadata.tiles[id];
    if (!meta?.origin) {
      throw new Error(`Tile ${id} sin metadata/origin`);
    }

    return {
      id,
      data: new Float32Array(buffer),
      meta
    };
  }
}
