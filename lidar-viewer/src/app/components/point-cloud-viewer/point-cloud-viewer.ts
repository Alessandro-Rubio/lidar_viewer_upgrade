import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild
} from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TileLoaderService, LoadedTile } from '../../services/tile-loader.service';

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

  private origin = new THREE.Vector3();
  private loadedTiles = new Set<string>();

  private lastCameraPos = new THREE.Vector3();
  private tileQueryCooldown = 0;

  constructor(private tileLoader: TileLoaderService) {}

  async ngOnInit() {
    this.initThree();
    await this.bootstrapDataset();
    this.animate();
  }

  ngOnDestroy() {
    this.renderer.dispose();
  }

  // ─────────────────────────────────────────────
  // DATASET
  // ─────────────────────────────────────────────
  private async bootstrapDataset() {
    const meta = await this.tileLoader.loadMetadata();

    const min = meta.bounds.min;
    const max = meta.bounds.max;

    this.origin.set(
      (min[0] + max[0]) * 0.5,
      (min[1] + max[1]) * 0.5,
      (min[2] + max[2]) * 0.5
    );

    this.camera.position.set(0, -150, 150);
    this.camera.near = 0.01;
    this.camera.far = 10000;
    this.camera.updateProjectionMatrix();

  }

  // ─────────────────────────────────────────────
  // THREE
  // ─────────────────────────────────────────────
  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      5000
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasRef.nativeElement
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(devicePixelRatio);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // DEBUG VISUAL
    this.scene.add(new THREE.AxesHelper(50));
    this.scene.add(new THREE.GridHelper(200, 20));
  }

  // ─────────────────────────────────────────────
  // LOOP
  // ─────────────────────────────────────────────
  private animate = () => {
    requestAnimationFrame(this.animate);

    this.controls.update();

    const moved =
      this.lastCameraPos.distanceToSquared(this.camera.position) > 25;

    if (moved && this.tileQueryCooldown <= 0) {
      this.updateVisibleTiles();
      this.lastCameraPos.copy(this.camera.position);
      this.tileQueryCooldown = 10;
    }

    this.tileQueryCooldown--;
    this.renderer.render(this.scene, this.camera);
  };

  // ─────────────────────────────────────────────
  // TILE LOADING
  // ─────────────────────────────────────────────
  private async updateVisibleTiles() {
    const box = new THREE.Box3();
    box.setFromCenterAndSize(
      this.controls.target,
      new THREE.Vector3(2000, 2000, 2000)
    );

    const tiles = await this.tileLoader.requestTilesForBBox(
      box.min,
      box.max
    );

    for (const tile of tiles) {
      if (this.loadedTiles.has(tile.id)) continue;

      this.loadedTiles.add(tile.id);
      this.addTileToScene(tile);
    }
  }

  // ─────────────────────────────────────────────
  // RENDER TILE
  // ─────────────────────────────────────────────
   private addTileToScene(tile: LoadedTile) {
    const data = tile.data;
    const meta = tile.meta;

    // ⚠️ SOLO XYZ
    const count = data.length / 3;

    if (count === 0) {
      console.warn('Tile vacío:', tile.id);
      return;
    }

    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] =
        data[i * 3 + 0] + meta.origin[0] - this.origin.x;

      positions[i * 3 + 1] =
        data[i * 3 + 1] + meta.origin[1] - this.origin.y;

      positions[i * 3 + 2] =
        data[i * 3 + 2] + meta.origin[2] - this.origin.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({
      size: 2.0,
      color: 0xffffff,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    console.log(
      `Tile ${tile.id} renderizado (${count.toLocaleString()} puntos)`
    );
  }

}
