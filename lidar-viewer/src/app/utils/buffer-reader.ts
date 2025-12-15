export class BufferReader {
  private view: DataView;
  private offset = 0;
  constructor(private buf: ArrayBuffer) { this.view = new DataView(buf); }

  remaining(): number { return this.view.byteLength - this.offset; }

  readUint32BE(): number {
    const v = (this.view.getUint8(this.offset) << 24) |
              (this.view.getUint8(this.offset + 1) << 16) |
              (this.view.getUint8(this.offset + 2) << 8) |
              (this.view.getUint8(this.offset + 3));
    this.offset += 4;
    return v >>> 0;
  }

  readBytes(len: number): Uint8Array {
    const r = new Uint8Array(this.view.buffer, this.offset, len);
    this.offset += len;
    return r;
  }
}
