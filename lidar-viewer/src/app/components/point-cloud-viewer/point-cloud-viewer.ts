import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild
} from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Octree } from '../../utils/octree';

@Component({
  selector: 'app-point-cloud-viewer',
  template: '<canvas #canvas></canvas>',
  styles: [':host { display:block; width:100%; height:100% }']
})
export class PointCloudViewer implements OnInit, OnDestroy {

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private geometry = new THREE.BufferGeometry();
  private points!: THREE.Points;

  private ws!: WebSocket;

  // ───── DATA CACHE ─────
  private posChunks: Float32Array[] = [];
  private colChunks: Float32Array[] = [];

  // ───── OCTREE ─────
  private octree!: Octree;
  private lodDirty = false;

  ngOnInit(): void {
    this.initThree();
    this.initWebSocket();
    this.animate();
  }

  ngOnDestroy(): void {
    this.ws?.close();
    this.renderer.dispose();
  }

  // ───────────────────────────────
  // THREE
  // ───────────────────────────────
  private initThree(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1e9
    );

    this.camera.position.set(0, 0, 10);

    const material = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      sizeAttenuation: true
    });

    this.points = new THREE.Points(this.geometry, material);
    this.scene.add(this.points);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasRef.nativeElement
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(devicePixelRatio);

    this.controls = new OrbitControls(
      this.camera,
      this.renderer.domElement
    );
    this.controls.enableDamping = true;
  }

  // ───────────────────────────────
  // WEBSOCKET
  // ───────────────────────────────
  private initWebSocket(): void {
    this.ws = new WebSocket(
      'ws://localhost:8000/ws/binary-stream?chunk_size=150000'
    );

    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => console.log('[WS] conectado');

    this.ws.onmessage = (ev) => {
      const data = new Float32Array(ev.data);
      const count = data.length / 6;

      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);

      let p = 0;
      let c = 0;

      for (let i = 0; i < data.length; i += 6) {
        pos[p++] = data[i];
        pos[p++] = data[i + 1];
        pos[p++] = data[i + 2];

        col[c++] = data[i + 3];
        col[c++] = data[i + 4];
        col[c++] = data[i + 5];
      }

      this.posChunks.push(pos);
      this.colChunks.push(col);

      // ─── MERGE ───
      const allPos = this.merge(this.posChunks);
      const allCol = this.merge(this.colChunks);

      // 🧭 CENTRAR NUBE
      const box = new THREE.Box3();
      for (let i = 0; i < allPos.length; i += 3) {
        box.expandByPoint(
          new THREE.Vector3(
            allPos[i],
            allPos[i + 1],
            allPos[i + 2]
          )
        );
      }

      const center = box.getCenter(new THREE.Vector3());

      for (let i = 0; i < allPos.length; i += 3) {
        allPos[i]     -= center.x;
        allPos[i + 1] -= center.y;
        allPos[i + 2] -= center.z;
      }

      this.octree = new Octree(allPos, allCol);
      this.lodDirty = true;
    };
  }

  // ───────────────────────────────
  // LOD
  // ───────────────────────────────
  private updateLOD(): void {
    if (!this.octree) return;

    const posChunks: Float32Array[] = [];
    const colChunks: Float32Array[] = [];

    this.octree.collectLOD(
      this.camera,
      this.octree.root,
      posChunks,
      colChunks
    );

    const pos = this.merge(posChunks);
    const col = this.merge(colChunks);

    if (pos.length === 0) return;

    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(pos, 3)
    );

    this.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(col, 3)
    );

    this.geometry.computeBoundingSphere();

    const s = this.geometry.boundingSphere;
    if (s) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 0, s.radius * 2);
      this.camera.lookAt(0, 0, 0);
    }

    this.lodDirty = false;
  }

  // ───────────────────────────────
  // UTILS
  // ───────────────────────────────
  private merge(arrays: Float32Array[]): Float32Array {
    let total = 0;
    for (const a of arrays) total += a.length;

    const out = new Float32Array(total);
    let offset = 0;

    for (const a of arrays) {
      out.set(a, offset);
      offset += a.length;
    }

    return out;
  }

  // ───────────────────────────────
  // LOOP
  // ───────────────────────────────
  private animate = () => {
    requestAnimationFrame(this.animate);

    this.controls.update();

    if (this.lodDirty) {
      this.updateLOD();
    }

    this.renderer.render(this.scene, this.camera);
  };
}
