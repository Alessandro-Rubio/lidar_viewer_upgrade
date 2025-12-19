import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import * as THREE from 'three';
import { TileLoaderService } from '../../services/tile-loader.service';

@Component({
  selector: 'app-point-cloud-viewer',
  template: `<div #container class="viewer"></div>`,
  styles: [
    `
      .viewer {
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class PointCloudViewer implements AfterViewInit {
  @ViewChild('container', { static: true }) container!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  constructor(private tileLoader: TileLoaderService) {}

  async ngAfterViewInit(): Promise<void> {
  const metadata = await this.tileLoader.loadMetadata();

  const tiles = this.tileLoader.getTileIds();
  console.log('Tiles encontrados:', tiles.length);

  for (const tileId of tiles.slice(0, 5)) {

    const buffer = await this.tileLoader.loadTile(tileId);

    // 🔴 LOG CRÍTICO (AQUÍ MISMO)
    console.log(`[Tile ${tileId}] bytes:`, buffer?.byteLength);

    if (!buffer || buffer.byteLength === 0) {
      console.error(`Tile ${tileId} vacío o inválido`);
      continue;
    }

    this.addTileToScene(tileId, buffer);
  }
}


  private initThree() {
    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
    this.camera.position.set(0, 0, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);

    this.container.nativeElement.appendChild(this.renderer.domElement);
  }

  private addTileToScene(tileId: string, buffer: ArrayBuffer): void {
    // BIN = [x, y, z, r, g, b] float32
    const data = new Float32Array(buffer);
    const points = data.length / 6;

    const positions = new Float32Array(points * 3);
    const colors = new Float32Array(points * 3);

    for (let i = 0; i < points; i++) {
      positions[i * 3] = data[i * 6];
      positions[i * 3 + 1] = data[i * 6 + 1];
      positions[i * 3 + 2] = data[i * 6 + 2];

      colors[i * 3] = data[i * 6 + 3] / 255;
      colors[i * 3 + 1] = data[i * 6 + 4] / 255;
      colors[i * 3 + 2] = data[i * 6 + 5] / 255;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
    });

    const cloud = new THREE.Points(geometry, material);
    this.scene.add(cloud);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };
  
}
