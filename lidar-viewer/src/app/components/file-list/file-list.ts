import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { WebsocketService } from '../../services/websocket/websocket';
import { LazStreamService } from '../../services/laz-stream/laz-stream';

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-list.html',
  styleUrls: ['./file-list.scss']
})
export class FileList implements OnDestroy {
  files: string[] = [];
  private sub?: Subscription;

  constructor(private ws: WebsocketService, private laz: LazStreamService) {
    this.sub = this.ws.onFiles().subscribe(list => {
      this.files = list || [];
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  open(name: string) {
    // Si backend soporta requestFile, lo envía; si no, sólo inicia stream.
    this.laz.requestFile(name);
  }

  startAll() {
    this.laz.start();
  }

  stopAll() {
    this.laz.stop();
  }
}
