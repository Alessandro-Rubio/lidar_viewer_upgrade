import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'file-explorer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-explorer.html',
  styleUrls: ['./file-explorer.css']
})
export class FileExplorer {
  @Input() files: any[] = [];
}