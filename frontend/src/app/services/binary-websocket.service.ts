import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface BinaryWSMeta {
  file_name: string;
  total_points: number;
  has_color?: boolean;
  start?: number;
  end?: number;
}

export interface BinaryWSMsg {
  type: 'meta' | 'positions' | 'colors' | 'json';
  meta?: BinaryWSMeta;
  buffer?: ArrayBuffer;
  data?: any;
}

@Injectable({
  providedIn: 'root'
})
export class BinaryWebsocketService {
  private socket: WebSocket | null = null;

  private messagesSubject = new Subject<BinaryWSMsg>();
  public messages$: Observable<BinaryWSMsg> = this.messagesSubject.asObservable();

  private closeSubject = new Subject<any>();
  public closings$ = this.closeSubject.asObservable();

  constructor() {}

  /**
   * Conectar en modo BINARIO
   * Retorna un observable de mensajes decodificados
   */
  connect(url: string): Observable<BinaryWSMsg> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";

    this.socket.onopen = () => {
      this.messagesSubject.next({ type: 'json', data: { type: 'connected' } });
    };

    this.socket.onmessage = (event) => {
      const data = event.data;

      // Caso 1: viene JSON
      if (typeof data === 'string') {
        try {
          const json = JSON.parse(data);
          this.messagesSubject.next({ type: 'json', data: json });
        } catch (e) {
          console.error('❌ Error parsing JSON message:', e);
        }
        return;
      }

      // Caso 2: viene ArrayBuffer → encabezado + payload
      if (data instanceof ArrayBuffer) {
        try {
          const dv = new DataView(data);
          const type = dv.getUint8(0);     // 0 = meta, 1 = positions, 2 = colors

          // meta viene codificado en JSON justo después del byte tipo
          const metaLen = dv.getUint32(1, true);
          const metaJsonBytes = new Uint8Array(data, 5, metaLen);
          const metaStr = new TextDecoder().decode(metaJsonBytes);
          const meta: BinaryWSMeta = JSON.parse(metaStr);

          const payload = data.slice(5 + metaLen);

          switch (type) {
            case 0:
              this.messagesSubject.next({ type: 'meta', meta });
              break;
            case 1:
              this.messagesSubject.next({ type: 'positions', meta, buffer: payload });
              break;
            case 2:
              this.messagesSubject.next({ type: 'colors', meta, buffer: payload });
              break;
            default:
              console.warn('⚠️ Tipo de paquete desconocido:', type);
          }

        } catch (e) {
          console.error("❌ Error decoding binary WS:", e);
        }
      }
    };

    this.socket.onerror = (ev) => {
      console.error("WebSocket error:", ev);
      this.messagesSubject.next({ type: 'json', data: { type: 'error', error: ev }});
    };

    this.socket.onclose = (ev) => {
      this.closeSubject.next(ev);
    };

    return this.messages$;
  }

  /**
   * Enviar texto/JSON
   */
  send(data: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  /**
   * Cerrar WS
   */
  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
