import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild
} from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TileLoaderService } from '../../services/tile-loader.service';

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

  private tileLoader!: TileLoaderService;
  private loadedTiles = new Set<string>();

  private lastCameraPos = new THREE.Vector3();
  private tileQueryCooldown = 0;


  ngOnInit(): void {
    this.initThree();
    this.tileLoader = new TileLoaderService();
    this.bootstrapDataset();
    this.animate();
  }

  ngOnDestroy(): void {
    this.renderer.dispose();
  }

  // ─────────────────────────────────────────────
  // DATASET
  // ─────────────────────────────────────────────

  private async bootstrapDataset() {
    const meta = await this.tileLoader.loadMetadata();

    const center = new THREE.Vector3(
      (meta.bounds.min[0] + meta.bounds.max[0]) * 0.5,
      (meta.bounds.min[1] + meta.bounds.max[1]) * 0.5,
      (meta.bounds.min[2] + meta.bounds.max[2]) * 0.5
    );

    this.camera.position.copy(center.clone().add(new THREE.Vector3(0, 0, 800)));
    this.controls.target.copy(center);
    this.controls.update();
  }

  // ─────────────────────────────────────────────
  // THREE
  // ─────────────────────────────────────────────

  private initThree(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1e9
    );

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

  // ─────────────────────────────────────────────
  // LOOP
  // ─────────────────────────────────────────────

  private animate = () => {
    requestAnimationFrame(this.animate);

    this.controls.update();

    const moved = this.lastCameraPos.distanceToSquared(this.camera.position) > 25;

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

    const tiles = await this.tileLoader.requestTilesForBBox(box.min, box.max);

    for (const tile of tiles) {
      if (this.loadedTiles.has(tile.id)) continue;

      this.loadedTiles.add(tile.id);
      this.addTileToScene(tile);
    }
  }

  // ─────────────────────────────────────────────
  // RENDER TILE
  // ─────────────────────────────────────────────

  private addTileToScene(tile: any) {
    const data = tile.data as Float32Array;
    const meta = tile.meta;

    const count = data.length / 6;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = data[i * 6 + 0] + meta.origin[0];
      positions[i * 3 + 1] = data[i * 6 + 1] + meta.origin[1];
      positions[i * 3 + 2] = data[i * 6 + 2] + meta.origin[2];

      colors[i * 3 + 0] = data[i * 6 + 3] / 255;
      colors[i * 3 + 1] = data[i * 6 + 4] / 255;
      colors[i * 3 + 2] = data[i * 6 + 5] / 255;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);
  }
}
