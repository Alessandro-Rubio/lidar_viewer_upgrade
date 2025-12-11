// src/app/components/loading-spinner/loading-spinner.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="loading-spinner"><div class="spinner"></div></div>`,
  styles: [`.loading-spinner{display:flex;align-items:center;justify-content:center;padding:1rem}.spinner{width:36px;height:36px;border:4px solid rgba(255,255,255,.15);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`]
})
export class LoadingSpinner {}
