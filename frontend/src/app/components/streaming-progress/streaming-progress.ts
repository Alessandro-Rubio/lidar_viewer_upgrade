import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StreamService } from '../../services/stream-service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'streaming-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './streaming-progress.html',
  styleUrls: ['./streaming-progress.css']
})
export class StreamingProgress implements OnInit, OnDestroy {
  @Input() sessionId: string = '';
  
  progress = {
    percentage: 0,
    filesProcessed: 0,
    totalFiles: 0,
    pointsLoaded: 0,
    currentFile: '',
    speed: 0,
    timeRemaining: 0
  };
  
  isStreaming = false;
  private streamSubscription?: Subscription;
  
  constructor(private streamService: StreamService) {}
  
  ngOnInit(): void {
    this.startStreaming();
  }
  
  startStreaming(): void {
    this.isStreaming = true;
    
    this.streamSubscription = this.streamService.streamData().subscribe({
      next: (chunk) => {
        this.updateProgress(chunk);
      },
      error: (error) => {
        console.error('Error en streaming:', error);
        this.isStreaming = false;
      },
      complete: () => {
        console.log('Streaming completado');
        this.isStreaming = false;
        this.progress.percentage = 100;
      }
    });
  }
  
  updateProgress(chunk: any): void {
    if (chunk.metadata) {
      this.progress = {
        percentage: chunk.metadata.progress_percentage || 0,
        filesProcessed: chunk.metadata.files_processed || 0,
        totalFiles: chunk.metadata.total_files || 0,
        pointsLoaded: chunk.data?.reduce((sum: number, file: any) => 
          sum + (file.total_points || 0), 0) || 0,
        currentFile: chunk.data?.[0]?.file_name || '',
        speed: 0, // Calcular basado en timestamp
        timeRemaining: 0 // Calcular basado en velocidad
      };
    }
  }
  
  pauseStreaming(): void {
    this.streamService.pauseStream();
    this.isStreaming = false;
  }
  
  resumeStreaming(): void {
    this.streamService.resumeStream();
    this.isStreaming = true;
  }
  
  stopStreaming(): void {
    this.streamSubscription?.unsubscribe();
    this.streamService.stopStream();
    this.isStreaming = false;
  }
  
  ngOnDestroy(): void {
    this.stopStreaming();
  }
}