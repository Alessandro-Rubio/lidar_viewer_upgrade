import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Metadata {
  min: number[];
  max: number[];
}

@Injectable({
  providedIn: 'root',
})
export class TileLoaderService {
  private baseUrl = 'http://localhost:8000/data/processed';
  private metadata!: Metadata;

  constructor(private http: HttpClient) {}

  async loadMetadata(): Promise<Metadata> {
    this.metadata = await firstValueFrom(
      this.http.get<Metadata>(`${this.baseUrl}/metadata.json`)
    );
    console.log('Metadata cargado:', this.metadata);
    return this.metadata;
  }

  getTileIds(): string[] {
    // metadata.tiles es un objeto: { "13_8": {...}, ... }
    return Object.keys((this.metadata as any).tiles ?? {});
  }

  async loadTile(tileId: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/tiles/${tileId}.bin`;

    const buffer = await firstValueFrom(
      this.http.get(url, { responseType: 'arraybuffer' })
    );

    return buffer;
  }
}
