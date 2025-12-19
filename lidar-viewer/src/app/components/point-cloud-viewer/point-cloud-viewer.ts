import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild
} from '@angular/core';

import * as THREE from 'three';

@Component({
  selector: 'app-point-cloud-viewer',
  standalone: true,
  template: `<div #container class="viewer"></div>`,
  styles: [`
    .viewer {
      width: 100vw;
      height: 100vh;
      background: black;
      overflow: hidden;
    }
  `]
})
export class PointCloudViewer implements AfterViewInit {

  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;

  globalOrigin!: { x: number; y: number; z: number };
  cameraInitialized = false;
  metadata: any;

  async ngAfterViewInit() {
    console.log('Attempting initialization', new Date());

    this.initThree();
    await this.loadMetadata();
    await this.loadFirstTiles();
    this.animate();
  }

  // =====================================================
  // THREE INIT
  // =====================================================
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const w = this.container.nativeElement.clientWidth;
    const h = this.container.nativeElement.clientHeight;

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1e9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.container.nativeElement.appendChild(this.renderer.domElement);

    console.log('Three.js initialized');
  }

  // =====================================================
  // METADATA
  // =====================================================
  async loadMetadata() {
  const res = await fetch('http://127.0.0.1:8000/data/processed/metadata.json');
  this.metadata = await res.json();

  console.log('Metadata cargado:', this.metadata);

  const b = this.metadata.bounds;

  this.globalOrigin = {
    x: (b.min[0] + b.max[0]) / 2,
    y: (b.min[1] + b.max[1]) / 2,
    z: (b.min[2] + b.max[2]) / 2
  };

  console.log('Global origin:', this.globalOrigin);
}


  // =====================================================
  // LOAD TILES
  // =====================================================
  async loadFirstTiles() {
    const keys = Object.keys(this.metadata.tiles);
    console.log('Tiles encontrados:', keys.length);

    for (const key of keys.slice(0, 50)) {
      const buffer = await fetch(
        `http://127.0.0.1:8000/data/processed/tiles/${key}.bin`
      ).then(r => r.arrayBuffer());

      this.addTileToScene(buffer);
    }
  }

  // =====================================================
  // BIN → POINTS (FORMATO REAL)
  // =====================================================
  addTileToScene(buffer: ArrayBuffer) {

  const STRIDE = 24; // 6 float32
  const view = new DataView(buffer);
  const count = buffer.byteLength / STRIDE;

  if (count === 0) return;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  let p = 0;
  let c = 0;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < buffer.byteLength; i += STRIDE) {

    const x = view.getFloat32(i, true) - this.globalOrigin.x;
    const y = view.getFloat32(i + 4, true) - this.globalOrigin.y;
    const z = view.getFloat32(i + 8, true) - this.globalOrigin.z;

    const r = view.getFloat32(i + 12, true) / 65535;
    const g = view.getFloat32(i + 16, true) / 65535;
    const b = view.getFloat32(i + 20, true) / 65535;

    positions[p++] = x;
    positions[p++] = y;
    positions[p++] = z;

    colors[c++] = r;
    colors[c++] = g;
    colors[c++] = b;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  if (!geometry.boundingSphere) {
    console.warn('BoundingSphere inválida, tile descartado');
    return;
  }

  const material = new THREE.PointsMaterial({
    size: 0.5,
    vertexColors: true
  });

  const points = new THREE.Points(geometry, material);
  this.scene.add(points);

  // 🎥 AUTO AJUSTE DE CÁMARA (solo primera vez)
  if (!this.cameraInitialized) {
  this.initCameraFromScene();
  this.cameraInitialized = true;
}

  console.log('Tile added:', count, 'points');
}
  // =====================================================
  // CAMERA
  // =====================================================
    initCameraFromScene() {

    const box = new THREE.Box3().setFromObject(this.scene);

    if (box.isEmpty()) {
      console.warn('Scene vacía, cámara no inicializada');
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);

    this.camera.position.set(
      center.x,
      center.y,
      center.z + maxDim * 2
    );

    this.camera.lookAt(center);

    this.camera.near = maxDim / 1000;
    this.camera.far = maxDim * 10;
    this.camera.updateProjectionMatrix();

    console.log('Camera initialized from scene');
  }


  // =====================================================
  // LOOP
  // =====================================================
  animate = () => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };
}
