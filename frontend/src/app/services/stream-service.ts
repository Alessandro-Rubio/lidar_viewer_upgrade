import { Injectable } from '@angular/core';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { WebSocketSubject, webSocket } from 'rxjs/webSocket';

@Injectable({
  providedIn: 'root'
})
export class StreamService {
  private wsSubject?: WebSocketSubject<any>;
  private streamSubject = new Subject<any>();
  
  // 🔥 CAMBIO: URLs corregidas
  private streamUrl = 'ws://localhost:8000/ws/stream';
  private httpStreamUrl = 'http://localhost:8000/api/stream-data';
  
  private isConnected = false;
  private sessionId = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    console.log('📡 StreamService inicializado');
  }

  // 🔥 CAMBIO: Método simplificado para iniciar streaming
  startStream(targetPoints: number = 100000): Observable<any> {
    return new Observable(observer => {
      console.log('🚀 Iniciando stream...');
      
      // Primero verificar que el backend esté disponible
      this.checkBackend().then(isAvailable => {
        if (!isAvailable) {
          observer.error('Backend no disponible en http://localhost:8000');
          return;
        }
        
        // Conectar WebSocket directamente
        this.connectWebSocketDirectly(targetPoints, observer);
      }).catch(error => {
        observer.error(`Error verificando backend: ${error}`);
      });
    });
  }

  private async checkBackend(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:8000/api/health');
      return response.ok;
    } catch (error) {
      console.error('❌ Backend no disponible:', error);
      return false;
    }
  }

  private connectWebSocketDirectly(targetPoints: number, observer: any): void {
    const wsUrl = `${this.streamUrl}?target_points=${targetPoints}`;
    console.log(`🔗 Conectando a WebSocket: ${wsUrl}`);
    
    try {
      this.wsSubject = webSocket({
        url: wsUrl,
        openObserver: {
          next: () => {
            console.log('✅ WebSocket conectado');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Enviar mensaje de inicio
            this.wsSubject?.next({
              type: 'start_stream',
              target_points: targetPoints
            });
          }
        },
        closeObserver: {
          next: (event: CloseEvent) => {
            console.log('🔌 WebSocket cerrado:', event);
            this.isConnected = false;
            
            if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnect(targetPoints, observer);
            }
          }
        }
      });

      // Suscribirse a mensajes
      this.wsSubject.subscribe({
        next: (data: any) => {
          console.log('📦 Datos recibidos:', data.type || 'sin tipo');
          this.streamSubject.next(data);
          observer.next(data);
          
          if (data.type === 'stream_complete') {
            console.log('🏁 Stream completado');
            observer.complete();
          }
        },
        error: (error: any) => {
          console.error('❌ Error en WebSocket:', error);
          this.streamSubject.error(error);
          observer.error(error);
        },
        complete: () => {
          console.log('✅ WebSocket completado');
          observer.complete();
        }
      });

    } catch (error) {
      console.error('❌ Error conectando WebSocket:', error);
      observer.error(error);
    }
  }

  private reconnect(targetPoints: number, observer: any): void {
    this.reconnectAttempts++;
    console.log(`🔄 Reintento ${this.reconnectAttempts}/${this.maxReconnectAttempts} en 2s...`);
    
    setTimeout(() => {
      this.connectWebSocketDirectly(targetPoints, observer);
    }, 2000);
  }

  // 🔥 NUEVO: Método alternativo usando HTTP Stream (SSE)
  startHttpStream(targetPoints: number = 100000, batchSize: number = 10): Observable<any> {
    return new Observable(observer => {
      const url = `${this.httpStreamUrl}?target_points=${targetPoints}&batch_size=${batchSize}`;
      console.log(`🌊 Iniciando HTTP Stream: ${url}`);
      
      const eventSource = new EventSource(url);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`📦 Chunk recibido: ${data.type || 'sin tipo'}`);
          this.streamSubject.next(data);
          observer.next(data);
          
          if (data.type === 'stream_complete') {
            console.log('🏁 HTTP Stream completado');
            eventSource.close();
            observer.complete();
          }
          
          if (data.type === 'stream_error') {
            console.error('❌ Error en stream:', data.error);
            eventSource.close();
            observer.error(data.error);
          }
        } catch (error) {
          console.error('❌ Error parseando datos:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('❌ Error en EventSource:', error);
        eventSource.close();
        observer.error(error);
      };
      
      // Limpiar al desuscribirse
      return () => {
        eventSource.close();
      };
    });
  }

  // 🔥 NUEVO: Método mejorado para iniciar sesión
  startStreamSession(targetPoints: number): Observable<any> {
    const url = `http://localhost:8000/api/start-stream-session?target_points=${targetPoints}`;
    console.log(`🎫 Iniciando sesión: ${url}`);
    
    return new Observable(observer => {
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('✅ Sesión iniciada:', data);
          observer.next(data);
          observer.complete();
        })
        .catch(err => {
          console.error('❌ Error iniciando sesión:', err);
          observer.error(err);
        });
    });
  }

  streamData(): Observable<any> {
    return this.streamSubject.asObservable();
  }

  pauseStream(): void {
    console.log('⏸️ Pausando stream...');
    if (this.wsSubject && this.isConnected) {
      this.wsSubject.next('pause');
    }
  }

  resumeStream(): void {
    console.log('▶️ Reanudando stream...');
    if (this.wsSubject && this.isConnected) {
      this.wsSubject.next('resume');
    }
  }

  stopStream(): void {
    console.log('🛑 Deteniendo stream...');
    if (this.wsSubject && this.isConnected) {
      this.wsSubject.next('stop_stream');
      this.wsSubject.complete();
      this.isConnected = false;
    }
    this.streamSubject.complete();
  }

  getStreamStatus(): { isConnected: boolean, sessionId: string } {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId
    };
  }
}