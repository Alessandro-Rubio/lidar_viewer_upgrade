import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: WebSocket | null = null;

  private messagesSubject = new Subject<any>();
  private closingsSubject = new Subject<any>();

  public messages$ = this.messagesSubject.asObservable();
  public closings$ = this.closingsSubject.asObservable();

  constructor() {}

  openStream(chunkSize: number = 100000): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    // 🔥 CORREGIDO
    const wsUrl = `ws://localhost:8000/ws/binary-stream?chunk_size=${chunkSize}`;
    this.socket = new WebSocket(wsUrl);

    this.socket.binaryType = "arraybuffer";

    this.socket.onopen = () => {
      this.messagesSubject.next({ type: 'connected' });
    };

    this.socket.onmessage = (event) => {
      try {
        // Si el mensaje es binario → pasarlo raw
        if (event.data instanceof ArrayBuffer) {
          this.messagesSubject.next(event.data);
          return;
        }

        const msg = JSON.parse(event.data);
        this.messagesSubject.next(msg);
      } catch (e) {
        console.error("❌ Error parsing WS message:", e);
      }
    };

    this.socket.onerror = (err) => {
      this.messagesSubject.next({ type: 'error', error: err });
    };

    this.socket.onclose = (ev) => {
      this.closingsSubject.next(ev);
    };
  }

  send(data: any): void {
    if (!this.socket) return;
    this.socket.send(JSON.stringify(data));
  }

  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
