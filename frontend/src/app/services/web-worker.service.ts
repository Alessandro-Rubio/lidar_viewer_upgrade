// src/app/services/web-worker.service.ts
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

type WorkerMap = Map<string, Worker>;
type SubjectMap = Map<string, Subject<any>>;

@Injectable({
  providedIn: 'root'
})
export class WebWorkerService {
  private workers: WorkerMap = new Map();
  private workerMessages: SubjectMap = new Map();

  constructor() {
    // Registrar workers si existen. Si no existen en build, try/catch evita fallo.
    try {
      this.registerWorker('data-processor', new Worker(new URL('../workers/data-processor.worker', import.meta.url)));
    } catch (e) {
      // ok si no existe; fallback a procesamiento en main-thread
      // console.warn('data-processor worker no encontrado');
    }

    try {
      this.registerWorker('point-cloud', new Worker(new URL('../workers/point-cloud.worker', import.meta.url)));
    } catch (e) {
      // optional
    }

    try {
      this.registerWorker('lod-calculator', new Worker(new URL('../workers/lod-calculator.worker', import.meta.url)));
    } catch (e) {
      // optional
    }
  }

  private registerWorker(name: string, worker: Worker): void {
    if (!worker) return;
    this.workers.set(name, worker);
    const subj = new Subject<any>();
    this.workerMessages.set(name, subj);

    worker.onmessage = (ev: MessageEvent) => subj.next(ev.data);
    worker.onerror = (err) => subj.error(err);
    worker.onmessageerror = (err) => subj.error(err);
  }

  execute<T = any>(workerName: string, payload: any, transfer?: Transferable[]): Observable<T> {
    const worker = this.workers.get(workerName);
    const subj = this.workerMessages.get(workerName);
    if (!worker || !subj) {
      throw new Error(`Worker ${workerName} no encontrado.`);
    }
    if (transfer && transfer.length > 0) worker.postMessage(payload, transfer);
    else worker.postMessage(payload);
    return subj.asObservable() as Observable<T>;
  }

  processDataBatchInBackground(files: any[]): Observable<any> {
    // si no existe el worker, lanzar error para que el componente haga fallback al main thread
    return this.execute<any>('data-processor', { type: 'process-batch', files });
  }

  terminateAllWorkers(): void {
    this.workers.forEach(w => {
      try { w.terminate(); } catch {}
    });
    this.workers.clear();
    this.workerMessages.forEach(s => s.complete());
    this.workerMessages.clear();
  }
}
