import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface LoadedTile {
  id: string;
  positions: Float32Array;
  colors: Float32Array;
}

@Injectable({ providedIn: 'root' })
export class TileLoaderService {

  private readonly BASE = 'http://localhost:8000/dataset';

  constructor(private http: HttpClient) {}

  async requestTiles(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): Promise<string[]> {

    return await firstValueFrom(
      this.http.get<string[]>(`${this.BASE}/tiles`, {
        params: {
          min_x: minX,
          min_y: minY,
          max_x: maxX,
          max_y: maxY
        }
      })
    );
  }

  async loadTile(id: string): Promise<LoadedTile> {

    const buffer = await firstValueFrom(
      this.http.get(
        `${this.BASE}/tile/${id}`,
        { responseType: 'arraybuffer' as const }
      )
    );

    const data = new Float32Array(buffer);
    const count = data.length / 6;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    let p = 0;
    let c = 0;

    for (let i = 0; i < data.length; i += 6) {
      positions[p++] = data[i];
      positions[p++] = data[i+1];
      positions[p++] = data[i+2];

      colors[c++] = data[i+3] / 65535;
      colors[c++] = data[i+4] / 65535;
      colors[c++] = data[i+5] / 65535;
    }

    return {
      id,
      positions,
      colors
    };
  }
}
