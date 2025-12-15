import { Injectable } from '@angular/core';
import { WebsocketService, ChunkPayload } from '../websocket/websocket';
import { Subject, Observable } from 'rxjs';

export interface StreamChunk {
  meta: any;
  positions: Float32Array;
}

@Injectable({
  providedIn: 'root'
})
export class LazStreamService {
  private chunk$ = new Subject<StreamChunk>();

  constructor(private ws: WebsocketService) {
    this.ws.onChunk().subscribe(payload => {
      if (!payload) return;
      const p = payload as ChunkPayload;
      const fa = new Float32Array(p.positions);
      this.chunk$.next({ meta: p.meta, positions: fa });
    });
  }

  onChunk(): Observable<StreamChunk> { return this.chunk$.asObservable(); }

  start(chunkSize = 150000) { this.ws.connect(chunkSize); }
  stop() { this.ws.disconnect(); }

  requestFile(name: string) {
    // Implementación cliente: si backend soporta petición, hay que enviar mensaje JSON.
    // Ejemplo (descomenta si implementas en backend):
    // this.ws.sendJson({ type: 'request_file', name });
  }
}
