import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

export interface DatasetMetadata {
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  tile_size: number;
  tiles: Record<string, {
    tx: number;
    ty: number;
    origin: [number, number, number];
    points: number;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class TileLoaderService {

  private baseUrl = 'http://localhost:8000/dataset';

  constructor(private http: HttpClient) {}

  // -------------------------------
  // METADATA
  // -------------------------------
  async loadMetadata(): Promise<DatasetMetadata> {

    const meta = await lastValueFrom(
      this.http.get<DatasetMetadata>(`${this.baseUrl}/metadata`)
    );

    if (!meta) {
      throw new Error('Metadata vacío');
    }

    return meta;
  }

  // -------------------------------
  // TILE LIST
  // -------------------------------
  async requestTilesForBBox(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): Promise<string[]> {

    const tiles = await lastValueFrom(
      this.http.get<string[]>(
        `${this.baseUrl}/tiles`,
        {
          params: {
            min_x: minX,
            min_y: minY,
            max_x: maxX,
            max_y: maxY
          }
        }
      )
    );

    return tiles ?? [];
  }

  // -------------------------------
  // TILE BINARY (✔ FIX DEFINITIVO)
  // -------------------------------
  async loadTile(tileId: string): Promise<Float32Array> {

    const buffer = await lastValueFrom(
      this.http.get(
        `${this.baseUrl}/tile/${tileId}`,
        { responseType: 'arraybuffer' }
      )
    );

    if (!(buffer instanceof ArrayBuffer)) {
      throw new Error(`Tile ${tileId} no es ArrayBuffer`);
    }

    return new Float32Array(buffer);
  }
}
