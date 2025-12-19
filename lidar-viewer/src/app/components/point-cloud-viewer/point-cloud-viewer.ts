import {
  AfterViewInit,
  Component,
  OnDestroy
} from '@angular/core';

import * as THREE from 'three';
import { TileLoaderService } from '../../services/tile-loader.service';

@Component({
  selector: 'app-point-cloud-viewer',
  standalone: true,
  template: '',
})
export class PointCloudViewer implements AfterViewInit, OnDestroy {

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animationId: number | null = null;

  constructor(private tileLoader: TileLoaderService) {}

  async ngAfterViewInit(): Promise<void> {

    console.log('Attempting initialization', new Date());

    this.initThree();

    await this.tileLoader.loadMetadata();

    const tiles = this.tileLoader.getTileIds();
    console.log('Tiles encontrados:', tiles.length);

    const tileId = tiles[0];
    const buffer = await this.tileLoader.loadTile(tileId);

    console.log(`[Tile ${tileId}] bytes:`, buffer.byteLength);

    this.addTileToScene(buffer);

    this.animate();
  }

  // =====================================================
  // THREE INIT
  // =====================================================
  private initThree(): void {

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1_000_000_000
    );

    this.camera.position.set(0, 0, 500);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    document.body.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onResize);

    console.log('Three.js initialized');
  }

  // =====================================================
  // BIN → POINTS
  // =====================================================
  private addTileToScene(buffer: ArrayBuffer): void {

  const STRIDE = 24;
  const view = new DataView(buffer);
  const count = buffer.byteLength / STRIDE;

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  let p = 0;
  let c = 0;

  for (let i = 0; i < buffer.byteLength; i += STRIDE) {

    const x = view.getFloat32(i, true);
    const y = view.getFloat32(i + 4, true);
    const z = view.getFloat32(i + 8, true);

    const r = view.getFloat32(i + 12, true) / 65535;
    const g = view.getFloat32(i + 16, true) / 65535;
    const b = view.getFloat32(i + 20, true) / 65535;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);

    positions[p++] = x;
    positions[p++] = y;
    positions[p++] = z;

    colors[c++] = r;
    colors[c++] = g;
    colors[c++] = b;
  }

  // 🔥 CENTRO REAL DEL TILE
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // 🔥 RE-CENTRAR GEOMETRÍA
  for (let i = 0; i < positions.length; i += 3) {
    positions[i]     -= centerX;
    positions[i + 1] -= centerY;
    positions[i + 2] -= centerZ;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    size: 1.0,
    vertexColors: true
  });

  const points = new THREE.Points(geometry, material);
  this.scene.add(points);

  // 🎥 AUTO-COLOCAR CÁMARA
  const radius = geometry.boundingSphere!.radius;

  this.camera.position.set(0, 0, radius * 2.5);
  this.camera.lookAt(0, 0, 0);
  this.camera.near = radius / 100;
  this.camera.far = radius * 10;
  this.camera.updateProjectionMatrix();

  console.log('Tile centered, camera adjusted');
}



  // =====================================================
  // LOOP
  // =====================================================
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  ngOnDestroy(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
