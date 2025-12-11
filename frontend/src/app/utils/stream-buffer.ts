// src/app/utils/stream-buffer.ts
export class StreamBuffer {
  private buffer: any[] = [];
  private callback: (chunks: any[]) => void;
  private timer: any = null;
  private maxChunks = 5;
  private flushTimeout = 120; // ms

  constructor(cb: (chunks: any[]) => void, opts?: { maxChunks?: number; flushTimeout?: number }) {
    this.callback = cb;
    if (opts?.maxChunks) this.maxChunks = opts.maxChunks;
    if (opts?.flushTimeout) this.flushTimeout = opts.flushTimeout;
  }

  addChunk(chunk: any) {
    this.buffer.push(chunk);
    if (this.buffer.length >= this.maxChunks) {
      this.flush();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.flushTimeout);
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.buffer.length === 0) return;
    const copy = [...this.buffer];
    this.buffer.length = 0;
    try {
      this.callback(copy);
    } catch (e) {
      console.error('StreamBuffer callback error', e);
    }
  }

  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.buffer.length = 0;
  }
}
