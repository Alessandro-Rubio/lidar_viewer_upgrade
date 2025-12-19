import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { PointCloudViewer } from './app/components/point-cloud-viewer/point-cloud-viewer';

bootstrapApplication(PointCloudViewer, {
  providers: [
    provideHttpClient()
  ]
}).catch(err => console.error(err));
