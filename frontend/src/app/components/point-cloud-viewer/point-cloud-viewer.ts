// src/app/components/point-cloud-viewer/point-cloud-viewer.ts
import { Component, Input, OnInit, OnDestroy, AfterViewInit, OnChanges, SimpleChanges, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { StreamBuffer } from '../../utils/stream-buffer'; // si lo usas
import { MemoryManager } from '../../utils/memory-manager';

type BinaryChunkMeta = {
  file_name: string;
  start: number;
  count: number;
  total_points: number;
  has_color?: boolean;
  // puedes extender con otras props
};

type PendingChunk = {
  meta: BinaryChunkMeta;
  positions?: Float32Array;
  colors?: Float32Array;
};

@Component({
  selector: 'point-cloud-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './point-cloud-viewer.html',
  styleUrls: ['./point-cloud-viewer.css']
})
export class PointCloudViewer implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @Input() pointCloudData: any[] = [];

  // THREE
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private memoryManager: MemoryManager;

  // pooling / buffers por archivo
  private filePools: Map<string, {
    posBuffer: Float32Array,        // float array (xyzxyz...)
    colorBuffer?: Float32Array,     // optional (rgbrgb...)
    writeOffset: number,            // floats written
    capacity: number,               // floats capacity
    geometry?: THREE.BufferGeometry,
    pointsObj?: THREE.Points
  }> = new Map();

  // defaults (ajusta según GPU / memoria)
  private DEFAULT_POINTS_CAPACITY = 2_000_000; // puntos por buffer (no floats)
  private DEFAULT_FLOAT_CAPACITY = this.DEFAULT_POINTS_CAPACITY * 3; // floats
  private DYNAMIC_BUFFER_USAGE = THREE.DynamicDrawUsage;

  // cola de procesamiento (chunks completados listos para insert)
  private incomingQueue: PendingChunk[] = [];
  private processingQueue = false;

  // websocket binary state
  private ws: WebSocket | null = null;
  private awaitingMeta = false;
  private currentMeta: BinaryChunkMeta | null = null;
  private lastWasMeta = false; // track sequence if necessary
  private partialPending: { [key: string]: PendingChunk } = {}; // key: file_start

  // render / stats
  private pointClouds: THREE.Points[] = [];
  private totalPoints = 0;
  public mapInfo = {
    puntosRenderizados: 0,
    archivosConColores: 0,
    bounds: { size: { x: 0, y: 0, z: 0 } },
    tieneColores: false,
    streamingActive: false
  };

  // optional stream buffer util (if you have one)
  private streamBuffer: StreamBuffer | null = null;

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {
    this.memoryManager = new MemoryManager();
    // if you have StreamBuffer imported and want to use:
    // this.streamBuffer = new StreamBuffer((d:any[]) => this.enqueueChunks(d));
  }

  ngOnInit(): void {
    // noop
  }

  ngAfterViewInit(): void {
    this.initThreeJS();
    this.animate();
    // if initial pointCloudData already present:
    if (this.pointCloudData && this.pointCloudData.length > 0) {
      // preallocate pools for metadata-aware files
      this.preparePoolsFromMetadata(this.pointCloudData);
      // push any already-loaded file data into queue
      for (const f of this.pointCloudData) {
        if (f.positions || f.points) {
          const chunk: PendingChunk = {
            meta: {
              file_name: f.file_name || f.fileName || (f.file || 'loaded'),
              start: 0,
              count: f.total_points || f.totalPoints || (f.positions ? ( (f.positions instanceof Float32Array) ? (f.positions.length/3) : (Array.isArray(f.positions) ? (f.positions.length/3) : 0) ) : 0),
              total_points: f.original_points || f.total_points || 0,
              has_color: !!f.colors
            },
            positions: this.normalizePositionsFromFileData(f),
            colors: this.normalizeColorsFromFileData(f)
          };
          this.incomingQueue.push(chunk);
        }
      }
      // start processing
      this.processBufferedChunks();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['pointCloudData']) return;
    const newVal = changes['pointCloudData'].currentValue as any[];
    if (!newVal || newVal.length === 0) {
      // clear scene safely
      setTimeout(() => this.clearScene(), 0);
      return;
    }
    // prepare pools and enqueue any in-memory files
    this.preparePoolsFromMetadata(newVal);
    // also enqueue any with positions already present
    for (const f of newVal) {
      if (f.positions || f.points) {
        const chunk: PendingChunk = {
          meta: {
            file_name: f.file_name || f.fileName || (f.file || 'loaded'),
            start: 0,
            count: f.total_points || f.totalPoints || (f.positions ? ( (f.positions instanceof Float32Array) ? (f.positions.length/3) : (Array.isArray(f.positions) ? (f.positions.length/3) : 0) ) : 0),
            total_points: f.original_points || f.total_points || 0,
            has_color: !!f.colors
          },
          positions: this.normalizePositionsFromFileData(f),
          colors: this.normalizeColorsFromFileData(f)
        };
        this.incomingQueue.push(chunk);
      }
    }
    this.processBufferedChunks();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // -------------------------
  // THREE init / animation
  // -------------------------
  private initThreeJS(): void {
    const host = this.elementRef.nativeElement as HTMLElement;
    let container = host.querySelector('.render-container') as HTMLElement | null;
    if (!container) container = host as HTMLElement;

    const width = container.clientWidth > 0 ? container.clientWidth : 1000;
    const height = container.clientHeight > 0 ? container.clientHeight : 800;
    const aspect = width / height;
    const viewSize = 1000;

    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect / 2, viewSize * aspect / 2,
      viewSize / 2, -viewSize / 2,
      0.1, 100000
    );
    this.camera.position.set(0, 0, 1000);
    this.camera.up.set(0, 1, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio || 1));
    container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.minPolarAngle = Math.PI / 2;
    this.controls.maxPolarAngle = Math.PI / 2;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(0, 0, 1000);
    this.scene.add(dir);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    try {
      if (this.controls) this.controls.update();
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    } catch (e) {
      // noop
    }
  };

  // -------------------------
  // Pooling / buffer helpers
  // -------------------------
  private preparePoolsFromMetadata(files: any[]) {
    for (const f of files) {
      const fileName = f.file_name || f.fileName || f.name || f.file;
      if (!fileName) continue;
      const expected = f.total_points || f.original_points || f.totalPoints || 0;
      const capacityPoints = Math.max( Math.min(expected || 2000000, 2_000_000), 200000 );
      this.createPoolIfNotExists(String(fileName), capacityPoints);
    }
  }

  private createPoolIfNotExists(fileName: string, capacityPoints: number) {
    if (this.filePools.has(fileName)) return;
    const floatCapacity = Math.max(capacityPoints * 3, this.DEFAULT_FLOAT_CAPACITY);
    const posBuffer = new Float32Array(floatCapacity);
    const colorBuffer = new Float32Array(floatCapacity); // allocate, use only if colors arrive

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(posBuffer, 3);
    posAttr.setUsage(this.DYNAMIC_BUFFER_USAGE);
    geometry.setAttribute('position', posAttr);

    // color attribute only when used (avoid until necessary)
    // geometry.setAttribute('color', new THREE.BufferAttribute(colorBuffer, 3));

    this.filePools.set(fileName, {
      posBuffer,
      colorBuffer,
      writeOffset: 0,
      capacity: floatCapacity,
      geometry,
      pointsObj: undefined
    });
  }

  private normalizePositionsFromFileData(f: any): Float32Array | undefined {
    // accept nested arrays [[x,y,z], ...], plain positions array [x,y,z,...], or Float32Array
    if (!f) return undefined;
    if (f.positions instanceof Float32Array) return f.positions;
    if (ArrayBuffer.isView(f.positions) && !(f.positions instanceof Float32Array)) {
      // typed array different type
      return new Float32Array((f.positions as any).buffer);
    }
    if (Array.isArray(f.positions) && f.positions.length > 0 && typeof f.positions[0] === 'number') {
      return new Float32Array(f.positions as number[]);
    }
    if (Array.isArray(f.points) && f.points.length > 0 && Array.isArray(f.points[0])) {
      const pts = f.points as number[][];
      const arr = new Float32Array(pts.length * 3);
      let idx = 0;
      for (let i = 0; i < pts.length; i++) {
        arr[idx++] = Number(pts[i][0] || 0);
        arr[idx++] = Number(pts[i][1] || 0);
        arr[idx++] = Number(pts[i][2] || 0);
      }
      return arr;
    }
    return undefined;
  }

  private normalizeColorsFromFileData(f: any): Float32Array | undefined {
    if (!f) return undefined;
    if (f.colors instanceof Float32Array) return f.colors;
    if (ArrayBuffer.isView(f.colors) && !(f.colors instanceof Float32Array)) return new Float32Array((f.colors as any).buffer);
    if (Array.isArray(f.colors) && f.colors.length > 0 && Array.isArray(f.colors[0])) {
      // nested [ [r,g,b], ... ]
      const n = f.colors.length;
      const arr = new Float32Array(n * 3);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        let r = Number(f.colors[i][0] ?? 0);
        let g = Number(f.colors[i][1] ?? 0);
        let b = Number(f.colors[i][2] ?? 0);
        if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
        arr[idx++] = r; arr[idx++] = g; arr[idx++] = b;
      }
      return arr;
    }
    return undefined;
  }

  // -------------------------
  // Incoming queue processing
  // -------------------------
  private processBufferedChunks() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    const doBatch = () => {
      try {
        const batchSize = 4;
        const batch = this.incomingQueue.splice(0, batchSize);
        if (batch.length === 0) {
          this.processingQueue = false;
          this.updateMapInfo();
          return;
        }

        for (const chunk of batch) {
          this.insertChunkIntoPool(chunk);
        }

        // schedule next
        if (this.incomingQueue.length > 0) {
          if ('requestIdleCallback' in window) (window as any).requestIdleCallback(doBatch, { timeout: 200 });
          else setTimeout(doBatch, 20);
        } else {
          this.processingQueue = false;
          this.updateMapInfo();
        }
      } catch (err) {
        console.error('processBufferedChunks error', err);
        this.processingQueue = false;
      }
    };

    if (this.incomingQueue.length > 0) doBatch();
    else this.processingQueue = false;
  }

  private insertChunkIntoPool(chunk: PendingChunk) {
    const meta = chunk.meta;
    const fileName = meta.file_name || 'streamed';
    // ensure pool
    if (!this.filePools.has(fileName)) {
      // choose capacity heuristics: at least chunk.count or default
      this.createPoolIfNotExists(fileName, Math.max(meta.count, 200000));
    }
    const pool = this.filePools.get(fileName)!;

    const floatsToWrite = (chunk.positions?.length ?? 0);
    if (floatsToWrite === 0) {
      console.warn('chunk sin posiciones, ignorando', meta);
      return;
    }

    // if capacity insufficient -> flush current and reallocate bigger pool
    if (pool.writeOffset + floatsToWrite > pool.capacity) {
      // flush existing buffer to scene
      this.flushPoolToScene(fileName);
      // reallocate larger pool (grow)
      const newCapacity = Math.max(pool.capacity * 2, pool.writeOffset + floatsToWrite);
      const newPos = new Float32Array(newCapacity);
      newPos.set(pool.posBuffer.subarray(0, pool.writeOffset), 0);
      pool.posBuffer = newPos;
      pool.capacity = newCapacity;
      // update geometry attribute if existed
      if (pool.geometry) {
        const posAttr = new THREE.BufferAttribute(pool.posBuffer, 3);
        posAttr.setUsage(this.DYNAMIC_BUFFER_USAGE);
        pool.geometry.setAttribute('position', posAttr);
      }
    }

    // copy positions (zero-copy if already Float32Array contiguous)
    pool.posBuffer.set(chunk.positions as Float32Array, pool.writeOffset);
    if (chunk.colors && pool.colorBuffer) {
      pool.colorBuffer.set(chunk.colors, pool.writeOffset);
    }
    pool.writeOffset += floatsToWrite;

    // ensure BufferAttribute.needsUpdate so Three updates GPU on next frame
    if (pool.geometry) {
      const posAttr = pool.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      posAttr.updateRange = { offset: 0, count: pool.writeOffset };
    }

    // optionally create pointsObj if not exists (deferred until flush to scene to minimize draw calls)
    if (!pool.pointsObj && pool.geometry) {
      // create an initially empty Points that will display data up to writeOffset
      const material = new THREE.PointsMaterial({ size: 1.0, sizeAttenuation: false, vertexColors: false });
      const pts = new THREE.Points(pool.geometry, material);
      pts.frustumCulled = false;
      // don't add to scene immediately (to avoid partially filled draws) - but we can add; it's okay
      this.scene.add(pts);
      pool.pointsObj = pts;
      this.pointClouds.push(pts);
    }
  }

  private flushPoolToScene(fileName: string) {
    const pool = this.filePools.get(fileName);
    if (!pool) return;
    if (pool.writeOffset === 0) return;

    // create sliced views of used portion (avoid copy by using subarray; BufferAttribute will use underlying buffer)
    const usedBuffer = pool.posBuffer.subarray(0, pool.writeOffset);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(usedBuffer, 3));

    if (pool.colorBuffer) {
      const usedColors = pool.colorBuffer.subarray(0, pool.writeOffset);
      geometry.setAttribute('color', new THREE.BufferAttribute(usedColors, 3));
    }

    const material = new THREE.PointsMaterial({ size: 1.0, sizeAttenuation: false, vertexColors: !!geometry.getAttribute('color') });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);
    this.pointClouds.push(points);

    this.totalPoints += Math.floor(pool.writeOffset / 3);

    // reset pool writeOffset for reuse
    pool.writeOffset = 0;

    // dispose previous dynamic geometry reference if present
    if (pool.geometry) {
      try { pool.geometry.dispose(); } catch {}
      pool.geometry = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(pool.posBuffer, 3);
      posAttr.setUsage(this.DYNAMIC_BUFFER_USAGE);
      pool.geometry.setAttribute('position', posAttr);
      pool.pointsObj = undefined;
    }
  }

  // -------------------------
  // Stats / UI helpers
  // -------------------------
  private updateMapInfo() {
    // compute lightweight stats
    let pts = 0;
    let filesWithColors = 0;
    for (const cloud of this.pointClouds) {
      const pos = cloud.geometry.getAttribute('position');
      if (pos) pts += pos.count;
      if (cloud.geometry.getAttribute('color')) filesWithColors++;
    }
    // include pools not flushed
    this.filePools.forEach(pool => {
      pts += Math.floor(pool.writeOffset / 3);
      if (pool.colorBuffer && pool.writeOffset > 0) filesWithColors++;
    });

    this.mapInfo.puntosRenderizados = pts;
    this.mapInfo.archivosConColores = filesWithColors;
    this.mapInfo.tieneColores = filesWithColors > 0;

    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  // -------------------------
  // Binary WebSocket handling
  // Protocol expected:
  // 1) JSON message (string) with meta { type: 'chunk_meta', meta: {...} }
  // 2) ArrayBuffer positions bytes (Float32Array)
  // 3) optional ArrayBuffer colors bytes (Float32Array) if meta.has_color
  // Repeat...
  // -------------------------
  public startBinaryStream(wsUrl: string) {
    // guard
    if (this.ws) this.stopBinaryStream();

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      // reset state
      this.awaitingMeta = false;
      this.currentMeta = null;
      this.partialPending = {};
      this.mapInfo.streamingActive = true;

      this.ws.onopen = () => {
        console.log('🔵 Binary WS connected', wsUrl);
      };

      this.ws.onmessage = (ev: MessageEvent) => {
        try {
          if (typeof ev.data === 'string') {
            // JSON control message
            const msg = JSON.parse(ev.data);
            // Expected types: chunk_meta, connected, progress, error, complete
            if (msg.type === 'chunk_meta' && msg.meta) {
              // note: msg.meta must match BinaryChunkMeta
              this.currentMeta = msg.meta as BinaryChunkMeta;
              // mark that next binary frame is positions
              this.lastWasMeta = true;
            } else if (msg.type === 'connected') {
              console.log('WS server connected:', msg);
            } else if (msg.type === 'progress') {
              // optional: show progress
            } else if (msg.type === 'complete') {
              console.log('WS stream complete');
              this.mapInfo.streamingActive = false;
              // flush all pools to scene
              this.filePools.forEach((_, fn) => this.flushPoolToScene(fn));
              this.updateMapInfo();
            } else if (msg.type === 'error') {
              console.error('WS backend error:', msg);
            } else {
              // handle other json messages
            }
          } else if (ev.data instanceof ArrayBuffer) {
            // binary frame: either positions or colors depending on currentMeta
            if (!this.currentMeta) {
              console.warn('Binary received without meta, ignoring');
              return;
            }
            const meta = this.currentMeta;
            // positions frame expected first
            const floats = new Float32Array(ev.data);
            // create pending key
            const key = `${meta.file_name}_${meta.start}`;
            if (!meta.has_color) {
              // single-frame chunk: positions only -> enqueue directly
              const chunk: PendingChunk = { meta, positions: floats };
              this.incomingQueue.push(chunk);
              this.processBufferedChunks();
              // clear currentMeta
              this.currentMeta = null;
            } else {
              // multi-frame: first binary is positions, second will be colors
              if (!this.partialPending[key]) {
                this.partialPending[key] = { meta, positions: floats };
                // wait for colors next
              } else {
                // unlikely: positions already present, treat as error or flush
                this.partialPending[key].positions = floats;
              }
            }
            this.lastWasMeta = false;
          } else {
            // Blob etc -> try to convert
            if (ev.data instanceof Blob) {
              const blob = ev.data;
              // read as arrayBuffer
              blob.arrayBuffer().then(buf => {
                // handle similar to above
                if (!this.currentMeta) {
                  console.warn('Blob binary received but no meta; ignoring');
                  return;
                }
                const floats = new Float32Array(buf);
                const meta = this.currentMeta!;
                const key = `${meta.file_name}_${meta.start}`;
                if (!meta.has_color) {
                  this.incomingQueue.push({ meta, positions: floats });
                  this.processBufferedChunks();
                  this.currentMeta = null;
                } else {
                  if (!this.partialPending[key]) this.partialPending[key] = { meta, positions: floats };
                  else this.partialPending[key].positions = floats;
                }
              }).catch(e => console.error('Error reading blob', e));
            }
          }
        } catch (err) {
          console.error('WS onmessage error', err);
        }
      };

      this.ws.onclose = (ev) => {
        console.warn('WS closed', ev);
        this.mapInfo.streamingActive = false;
        // try flush remaining pending pairs (if any: match positions+colors)
        for (const k of Object.keys(this.partialPending)) {
          const p = this.partialPending[k];
          // if color missing, still push positions
          if (p.positions && !p.colors) {
            this.incomingQueue.push({ meta: p.meta, positions: p.positions });
          } else if (p.positions && p.colors) {
            this.incomingQueue.push({ meta: p.meta, positions: p.positions, colors: p.colors });
          }
        }
        this.partialPending = {};
        this.processBufferedChunks();
      };

      this.ws.onerror = (ev) => {
        console.error('WS error', ev);
        this.mapInfo.streamingActive = false;
      };

    } catch (e) {
      console.error('startBinaryStream error', e);
      this.mapInfo.streamingActive = false;
    }
  }

  public stopBinaryStream() {
    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.mapInfo.streamingActive = false;
    } catch (e) {
      // noop
    }
  }

  // This method should be called by onmessage when colors frame arrives.
  // If your server sends colors as a separate ArrayBuffer after positions,
  // the logic above stores positions in partialPending keyed by file+start.
  // The following public helper lets you provide a colors ArrayBuffer (for custom pipelines).
  public attachColorsToPending(meta: BinaryChunkMeta, colorsBuffer: ArrayBuffer) {
    const key = `${meta.file_name}_${meta.start}`;
    const pending = this.partialPending[key];
    if (!pending) {
      console.warn('attachColorsToPending: pending not found', key);
      return;
    }
    pending.colors = new Float32Array(colorsBuffer);
    // now push combined chunk
    this.incomingQueue.push(pending);
    delete this.partialPending[key];
    this.processBufferedChunks();
  }

  // -------------------------
  // Utilities
  // -------------------------
  private clearScene() {
    this.pointClouds.forEach(cloud => {
      try { this.scene.remove(cloud); } catch {}
      try { if (cloud.geometry) cloud.geometry.dispose(); } catch {}
      try { if (cloud.material) (cloud.material as any).dispose(); } catch {}
    });
    this.pointClouds = [];
    this.filePools.forEach(pool => {
      try { if (pool.geometry) pool.geometry.dispose(); } catch {}
      pool.posBuffer = null as any;
      if (pool.colorBuffer) pool.colorBuffer = null as any;
    });
    this.filePools.clear();
    this.totalPoints = 0;
    this.mapInfo = { ...this.mapInfo, puntosRenderizados: 0, archivosConColores: 0, tieneColores: false };
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  private cleanup() {
    try { this.stopBinaryStream(); } catch {}
    try { this.clearScene(); } catch {}
    try { this.renderer.dispose(); const c = this.renderer.domElement; if (c.parentNode) c.parentNode.removeChild(c); } catch {}
    try { this.memoryManager.destroy(); } catch {}
  }
}
