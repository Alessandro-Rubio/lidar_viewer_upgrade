import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ChunkMeta { [k: string]: any; count?: number; file?: string; type?: string; colors?: boolean; }
export interface ChunkPayload { meta: ChunkMeta; positions: ArrayBuffer; colors?: ArrayBuffer; }

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private ws?: WebSocket;
  private baseUrl = 'ws://localhost:8000/ws/binary-stream';

  private meta$ = new BehaviorSubject<ChunkMeta | null>(null);
  private chunk$ = new BehaviorSubject<ChunkPayload | null>(null);
  private files$ = new BehaviorSubject<string[]>([]);
  private status$ = new BehaviorSubject<string>('closed');

  private buffer = new Uint8Array(0);

  constructor(private zone: NgZone) {}

  connect(chunkSize = 150000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    const url = `${this.baseUrl}?chunk_size=${chunkSize}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[WS] open', url);
      this.zone.run(() => this.status$.next('open'));
    };

    this.ws.onmessage = (ev) => this.zone.run(() => this.handleMessage(ev.data));
    this.ws.onclose = () => { console.log('[WS] closed'); this.zone.run(() => this.status$.next('closed')); };
    this.ws.onerror = (err) => { console.error('[WS] error', err); this.zone.run(() => this.status$.next('error')); };
  }

  disconnect() {
    this.ws?.close();
    this.ws = undefined;
    this.buffer = new Uint8Array(0);
    this.status$.next('closed');
  }

  sendJSON(obj: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(obj)); } catch (e) { console.warn('sendJSON failed', e); }
  }

  onMeta(): Observable<ChunkMeta | null> { return this.meta$.asObservable(); }
  onChunk(): Observable<ChunkPayload | null> { return this.chunk$.asObservable(); }
  onFiles(): Observable<string[]> { return this.files$.asObservable(); }
  onStatus(): Observable<string> { return this.status$.asObservable(); }

  private handleMessage(data: any) {
    if (typeof data === 'string') {
      try {
        const j = JSON.parse(data);
        if (j.type === 'files' && Array.isArray(j.files)) {
          // stable unique set
          const cur = new Set(this.files$.value || []);
          j.files.forEach((f: string) => cur.add(f));
          this.files$.next(Array.from(cur));
        } else {
          this.meta$.next(j);
        }
      } catch {
        // ignore human-log strings
        console.debug('[WS] ignored text message');
      }
      return;
    }

    const incoming = new Uint8Array(data);
    const newBuf = new Uint8Array(this.buffer.length + incoming.length);
    newBuf.set(this.buffer, 0);
    newBuf.set(incoming, this.buffer.length);
    this.buffer = newBuf;

    while (this.buffer.length >= 4) {
      const metaLen = (this.buffer[0] << 24) | (this.buffer[1] << 16) | (this.buffer[2] << 8) | (this.buffer[3]);
      if (this.buffer.length < 4 + metaLen) break;

      const metaBytes = this.buffer.slice(4, 4 + metaLen);
      const metaText = new TextDecoder().decode(metaBytes);
      let meta: ChunkMeta = {};
      try { meta = JSON.parse(metaText); } catch (e) { console.error('[WS] meta parse error', e); this.buffer = this.buffer.slice(4 + metaLen); continue; }

      const count = meta.count || 0;
      const posBytes = count * 3 * 4;
      const hasColors = !!meta['colors'];
      const colorBytes = hasColors ? count * 3 * 2 : 0;

      if (this.buffer.length < 4 + metaLen + posBytes + colorBytes) break;

      const start = 4 + metaLen;
      const positions = this.buffer.slice(start, start + posBytes).buffer as ArrayBuffer;
      const colors = hasColors ? this.buffer.slice(start + posBytes, start + posBytes + colorBytes).buffer as ArrayBuffer : undefined;

      // update files collection
      if (meta.file) {
        const cur = new Set(this.files$.value || []);
        cur.add(meta.file);
        this.files$.next(Array.from(cur));
      }

      this.meta$.next(meta);
      this.chunk$.next({ meta, positions, colors });

      this.buffer = this.buffer.slice(start + posBytes + colorBytes);
    }
  }
}
