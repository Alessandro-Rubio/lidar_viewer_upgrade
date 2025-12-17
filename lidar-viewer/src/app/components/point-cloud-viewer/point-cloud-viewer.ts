import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild
} from '@angular/core';

import * as THREE from 'three';
import { TileLoaderService, DatasetMetadata } from '../../services/tile-loader.service';

@Component({
  selector: 'app-point-cloud-viewer',
  templateUrl: './point-cloud-viewer.html',
  styleUrls: ['./point-cloud-viewer.scss']
})
export class PointCloudViewer implements OnInit, OnDestroy {

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  private datasetOrigin = new THREE.Vector3();
  private visibleTiles = new Set<string>();
  private metadata!: DatasetMetadata;

  private animationId = 0;

  constructor(private tileLoader: TileLoaderService) {}

  async ngOnInit() {
    console.log('Attempting initialization');

    this.initThree();
    await this.loadDataset();
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
  }

  // ------------------------------------
  // THREE SETUP
  // ------------------------------------

  private initThree() {

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.01,
      5000
    );

    this.camera.position.set(0, -200, 200);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasRef.nativeElement,
      antialias: true
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Grid (debug)
    const grid = new THREE.GridHelper(400, 40, 0x444444, 0x222222);
    this.scene.add(grid);
  }

  // ------------------------------------
  // DATASET
  // ------------------------------------

  private async loadDataset() {

    this.metadata = await this.tileLoader.loadMetadata();

    this.datasetOrigin.set(
      this.metadata.bounds.min[0],
      this.metadata.bounds.min[1],
      this.metadata.bounds.min[2]
    );

    const tiles = await this.tileLoader.requestTilesForBBox(
      this.metadata.bounds.min[0],
      this.metadata.bounds.min[1],
      this.metadata.bounds.max[0],
      this.metadata.bounds.max[1]
    );

    for (const tileId of tiles) {
      await this.loadAndAddTile(tileId);
    }
  }

  private async loadAndAddTile(tileId: string) {

    if (this.visibleTiles.has(tileId)) return;
    this.visibleTiles.add(tileId);

    const data = await this.tileLoader.loadTile(tileId);
    this.addTileToScene(tileId, data);
  }

  // ------------------------------------
  // TILE RENDER
  // ------------------------------------

  private addTileToScene(tileId: string, data: Float32Array) {

    const count = data.length / 3;

    if (count === 0) {
      console.warn('Tile vacío:', tileId);
      return;
    }

    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = data[i * 3 + 0] - this.datasetOrigin.x;
      positions[i * 3 + 1] = data[i * 3 + 1] - this.datasetOrigin.y;
      positions[i * 3 + 2] = data[i * 3 + 2] - this.datasetOrigin.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({
      size: 1.2,
      color: 0xffffff,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    console.log(`Tile ${tileId} renderizado → ${count.toLocaleString()} pts`);
  }

  // ------------------------------------
  // LOOP
  // ------------------------------------

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };
}
