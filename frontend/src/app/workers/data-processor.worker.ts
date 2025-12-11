// src/app/workers/data-processor.worker.ts
/* eslint-disable no-restricted-globals */
self.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg) return;

  switch (msg.type) {
    case 'process-batch': {
      const files = Array.isArray(msg.files) ? msg.files : [];
      const resultFiles: any[] = [];

      for (const f of files) {
        // normalizar posiciones
        let positions: Float32Array | null = null;
        let colors: Float32Array | null = null;

        try {
          if (f.positions) {
            // puede venir como ArrayBuffer, TypedArray o array
            if (f.positions instanceof ArrayBuffer) positions = new Float32Array(f.positions);
            else if (ArrayBuffer.isView(f.positions)) positions = new Float32Array((f.positions as any).buffer || f.positions);
            else if (Array.isArray(f.positions)) positions = new Float32Array(f.positions);
          } else if (Array.isArray(f.points)) {
            positions = new Float32Array(f.points.length * 3);
            let k = 0;
            for (let i = 0; i < f.points.length; i++) {
              const p = f.points[i] || [0, 0, 0];
              positions[k++] = Number(p[0] ?? 0);
              positions[k++] = Number(p[1] ?? 0);
              positions[k++] = Number(p[2] ?? 0);
            }
          }

          // colores (si vienen)
          if (f.colors) {
            if (f.colors instanceof ArrayBuffer) colors = new Float32Array(f.colors);
            else if (ArrayBuffer.isView(f.colors)) colors = new Float32Array((f.colors as any).buffer || f.colors);
            else if (Array.isArray(f.colors)) {
              if (Array.isArray(f.colors[0])) {
                colors = new Float32Array(f.colors.length * 3);
                let idx = 0;
                for (let i = 0; i < f.colors.length; i++) {
                  let r = Number(f.colors[i][0] ?? 0);
                  let g = Number(f.colors[i][1] ?? 0);
                  let b = Number(f.colors[i][2] ?? 0);
                  if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
                  colors[idx++] = r; colors[idx++] = g; colors[idx++] = b;
                }
              } else {
                colors = new Float32Array(f.colors);
              }
            }
          }
        } catch (e) {
          // ignore; dejar como null
        }

        const out: any = {
          file_name: f.file_name || f.fileName || 'unk',
          total_points: positions ? (positions.length / 3) : (f.total_points || 0)
        };

        // enviar como ArrayBuffer para transferencia
        out.positions = positions ? positions.buffer : null;
        out.colors = colors ? colors.buffer : null;

        resultFiles.push(out);
      }

      // Post con transferencia de todos los buffers
      const transfer: ArrayBuffer[] = [];
      for (const rf of resultFiles) {
        if (rf.positions) transfer.push(rf.positions);
        if (rf.colors) transfer.push(rf.colors);
      }
      // Responder
      (self as any).postMessage({ type: 'batch_result', files: resultFiles }, transfer);
      break;
    }
    default:
      break;
  }
});
