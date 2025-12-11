// src/app/app.ts
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService } from './services/websocket.service';
import { PointCloudViewer } from './components/point-cloud-viewer/point-cloud-viewer';
import { LoadingSpinner } from './components/loading-spinner/loading-spinner';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
  imports: [CommonModule, PointCloudViewer, LoadingSpinner]
})
export class AppComponent implements OnInit {
  connectionStatus: 'connected' | 'error' | 'checking' = 'checking';
  hasError = false;

  // Punto clave: no renderizar al vuelo — almacenamos temporalmente
  private bufferedFiles: any[] = [];

  // Sólo cuando complete llega -> asignamos esto y se renderiza
  pointCloudData: any[] = [];

  isLoading = false;
  backendInfo: any = null;

  // Stats simples (actualízalas al final si quieres)
  stats = {
    files: 0,
    points: 0
  };

  constructor(
    public websocket: WebSocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('🚀 AppComponent iniciado');

    // Mensajes del WS
    this.websocket.messages$.subscribe((msg: any) => {
      if (!msg) return;

      switch (msg.type) {
        case 'connected':
          this.connectionStatus = 'connected';
          this.hasError = false;
          this.isLoading = true; // empezamos a recibir
          // defer UI update
          setTimeout(() => this.cdr.detectChanges(), 0);
          break;

        case 'data_chunk':
          // Guardamos los archivos en el buffer (no renderizamos aún)
          if (Array.isArray(msg.files) && msg.files.length > 0) {
            // validación ligera: aceptar sólo los que tengan puntos o posiciones
            const valid = msg.files.filter((f: any) =>
              f && (Array.isArray(f.points) && f.points.length > 0 ||
                    f.positions && ((f.positions.byteLength && f.positions.byteLength > 0) || f.positions.length))
            );
            if (valid.length > 0) {
              this.bufferedFiles.push(...valid);
              // actualizar stats de forma no intrusiva
              this.stats.files = this.bufferedFiles.length;
              setTimeout(() => this.cdr.detectChanges(), 0);
            }
          }
          break;

        case 'progress':
          // Puedes usar esto para barra de progreso
          if (msg.progress !== undefined) {
            // Actualizar UI sin causar NG0100
            setTimeout(() => this.cdr.detectChanges(), 0);
          }
          break;

        case 'complete':
          // El backend confirma que ya procesó todo: ahora renderizamos todo junto
          console.log('🟢 Streaming completo. Archivos buffered =', this.bufferedFiles.length);
          // crear nueva referencia para Angular y asignar
          this.pointCloudData = [...this.bufferedFiles];
          this.stats.files = this.pointCloudData.length;
          this.bufferedFiles = [];
          this.isLoading = false;
          // Defer detectChanges para evitar ExpressionChangedAfterItHasBeenCheckedError
          setTimeout(() => this.cdr.detectChanges(), 0);
          break;

        case 'error':
          console.error('❌ Error backend:', msg);
          this.connectionStatus = 'error';
          this.hasError = true;
          this.isLoading = false;
          setTimeout(() => this.cdr.detectChanges(), 0);
          break;

        default:
          // backendInfo u otros mensajes
          if (msg.backendInfo) {
            this.backendInfo = msg.backendInfo;
            setTimeout(() => this.cdr.detectChanges(), 0);
          }
          break;
      }
    });

    // cuando socket se cierra
    this.websocket.closings$.subscribe((ev: any) => {
      console.warn('⚠️ WebSocket cerrado', ev);
      this.connectionStatus = 'error';
      this.hasError = true;
      setTimeout(() => this.cdr.detectChanges(), 0);
    });
  }

  connectStream(): void {
    this.isLoading = true;
    this.connectionStatus = 'checking';
    this.bufferedFiles = [];
    this.pointCloudData = [];
    setTimeout(() => this.cdr.detectChanges(), 0);

    // abrir stream (ejemplo: 100k)
    this.websocket.openStream(100000);
  }

  disconnect(): void {
    this.websocket.close();
    this.connectionStatus = 'error';
    this.isLoading = false;
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  resetApplication(): void {
    this.bufferedFiles = [];
    this.pointCloudData = [];
    this.stats = { files: 0, points: 0 };
    this.hasError = false;
    setTimeout(() => this.cdr.detectChanges(), 0);
  }
}
