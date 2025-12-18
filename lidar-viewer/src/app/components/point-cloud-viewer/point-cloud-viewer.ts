import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy
} from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { TileLoaderService, LoadedTile } from '../../services/tile-loader.service';

@Component({
  selector: 'app-point-cloud-viewer',
  templateUrl: './point-cloud-viewer.html',
  styleUrls: ['./point-cloud-viewer.scss']
})
export class PointCloudViewer implements AfterViewInit, OnDestroy {

  @ViewChild('rendererContainer', { static: true })
  rendererContainer!: ElementRef<HTMLDivElement>;

  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;
  private scene!: THREE.Scene;
  private controls!: OrbitControls;

  private tiles = new Map<string, THREE.Points>();

  private animId = 0;

  constructor(private loader: TileLoaderService) {}

  ngAfterViewInit(): void {
    this.initThree();
    this.loadInitialTiles();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animId);
  }

  // ---------------------------------------------------
  // THREE INIT
  // ---------------------------------------------------

  private initThree(): void {

    const el = this.rendererContainer.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(
      60,
      el.clientWidth / el.clientHeight,
      0.1,
      2000000
    );

    // FIX – camera elevated so grid is visible
    this.camera.position.set(0, 150, 250);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);

    // grid visible properly
    const grid = new THREE.GridHelper(500, 50);
    this.scene.add(grid);

    window.addEventListener('resize', () => this.onResize());

    this.animate();
  }

  private onResize(): void {
    const el = this.rendererContainer.nativeElement;

    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  }

  // ---------------------------------------------------
  // TILES
  // ---------------------------------------------------

  private async loadInitialTiles(): Promise<void> {

    const ids = await this.loader.requestTiles(-1000, -1000, 1000, 1000);

    for (const id of ids) {
      const tile = await this.loader.loadTile(id);
      if (tile) {
        this.addTile(tile);
      }
    }
  }

  private addTile(tile: LoadedTile): void {

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(tile.positions, 3)
  );

  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(tile.colors, 3)
  );

  const material = new THREE.PointsMaterial({
    size: 1,
    vertexColors: true
  });

  const points = new THREE.Points(geometry, material);

  this.scene.add(points);
}


  // ---------------------------------------------------
  // LOOP
  // ---------------------------------------------------

  private animate(): void {
    this.animId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
