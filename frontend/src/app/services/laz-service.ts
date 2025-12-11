import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LAZFile {
  name: string;
  path: string;
  size: string;
  size_bytes: number;
}

export interface PointCloudData {
  points: number[][];
  colors?: number[][];
  bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    min_z: number;
    max_z: number;
  };
  total_points: number;
  original_points: number;
  file_name?: string;
  file_info?: LAZFile;
  error?: string;
}

export interface AllDataResponse {
  files: PointCloudData[];
  total_files: number;
  total_points: number;
  status: string;
  optimized?: boolean;
  target_points_per_file?: number;
  message?: string;
  has_more?: boolean;
  web_workers_used?: boolean;
  processing_time_seconds?: number;
}

export interface TestConnectionResponse {
  status: string;
  message: string;
  data_files: number;
  file_list?: string[];
  total_size_gb?: number;
  capabilities?: {
    streaming?: boolean;
    web_socket?: boolean;
    infinite_stream?: boolean;
    web_workers?: boolean;
    [key: string]: any;
  };
}

export interface StreamSessionResponse {
  session_id: string;
  status: string;
  stream_url: string;
  websocket_url: string;
  infinite_stream_url: string;
  target_points: number;
  streaming_enabled: boolean;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class LAZService {
  private apiUrl = 'http://localhost:8000/api';

  constructor(private http: HttpClient) {}

  getFiles(): Observable<LAZFile[]> {
    return this.http.get<LAZFile[]>(`${this.apiUrl}/files`);
  }

  // 🔥 MODIFICADO: Método para cargar TODOS los datos con soporte para Web Workers
  getAllDataForLargeVolumes(
    targetPoints: number = 500000,
    useWorkers: boolean = true
  ): Observable<AllDataResponse> {
    const params = new HttpParams()
      .set('target_points', targetPoints.toString())
      .set('use_workers', useWorkers.toString());
    
    return this.http.get<AllDataResponse>(`${this.apiUrl}/all-data`, { params });
  }

  // 🔥 NUEVO: Método para streaming server-sent events (SSE)
  getStreamData(
    targetPoints: number = 100000,
    batchSize: number = 10
  ): Observable<MessageEvent> {
    const params = new HttpParams()
      .set('target_points', targetPoints.toString())
      .set('batch_size', batchSize.toString());
    
    return new Observable(observer => {
      const eventSource = new EventSource(`${this.apiUrl}/stream-data?${params.toString()}`);
      
      eventSource.onmessage = (event) => {
        observer.next(event);
      };
      
      eventSource.onerror = (error) => {
        observer.error(error);
        eventSource.close();
      };
      
      return () => {
        eventSource.close();
      };
    });
  }

  // 🔥 NUEVO: Método para iniciar sesión de streaming
  startStreamSession(targetPoints: number = 100000): Observable<StreamSessionResponse> {
    const params = new HttpParams().set('target_points', targetPoints.toString());
    return this.http.get<StreamSessionResponse>(`${this.apiUrl}/start-stream-session`, { params });
  }

  // Método para carga progresiva
  getProgressiveData(
    targetPoints: number = 500000, 
    batchSize: number = 50
  ): Observable<AllDataResponse> {
    const params = new HttpParams()
      .set('target_points', targetPoints.toString())
      .set('batch_size', batchSize.toString());
    
    return this.http.get<AllDataResponse>(`${this.apiUrl}/progressive-data`, { params });
  }

  testConnection(): Observable<TestConnectionResponse> {
    return this.http.get<TestConnectionResponse>(`${this.apiUrl}/test`);
  }

  // 🔥 MODIFICADO: Método para cargar con configuración específica
  loadAllFilesWithConfig(
    targetPoints: number, 
    useProgressive: boolean = false,
    useStreaming: boolean = false
  ): Observable<AllDataResponse> {
    if (useStreaming) {
      // Para streaming, usamos un enfoque diferente
      throw new Error('Para streaming, usa startStreamSession() y getStreamData()');
    } else if (useProgressive) {
      const batchSize = this.calculateOptimalBatchSize(targetPoints);
      return this.getProgressiveData(targetPoints, batchSize);
    } else {
      return this.getAllDataForLargeVolumes(targetPoints, true);
    }
  }

  private calculateOptimalBatchSize(targetPoints: number): number {
    if (targetPoints > 2000000) return 10;    // Para muchos puntos, lotes pequeños
    if (targetPoints > 1000000) return 20;    // Lotes medianos
    if (targetPoints > 500000) return 30;     // Lotes más grandes
    return 50;                                // Lotes grandes para pocos puntos
  }

  // 🔥 NUEVO: Método para obtener información del sistema
  getSystemInfo(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/system-info`);
  }

  // 🔥 NUEVO: Método para probar configuración
  testConfiguration(
    targetPoints: number = 1000000,
    testFiles: number = 3
  ): Observable<any> {
    const params = new HttpParams()
      .set('target_points', targetPoints.toString())
      .set('test_files', testFiles.toString());
    
    return this.http.get<any>(`${this.apiUrl}/test-configuration`, { params });
  }
}