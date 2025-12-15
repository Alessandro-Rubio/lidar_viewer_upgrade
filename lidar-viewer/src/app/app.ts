import { Component } from '@angular/core';
import { PointCloudViewer } from './components/point-cloud-viewer/point-cloud-viewer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PointCloudViewer],
  template: `<app-point-cloud-viewer></app-point-cloud-viewer>`
})
export class AppComponent {}
