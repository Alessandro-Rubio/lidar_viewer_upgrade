/// <reference lib="webworker" />

// Worker dedicado al preprocesado pesado de batches
// Asegúrate de que Angular lo reconoce como web worker ES MODULE.

addEventListener('message', (event) => {
  const { id, batch } = event.data;

  try {
    const processed = [];

    for (const file of batch) {
      const out: any = { ...file };

      // Normalizar posiciones (si fuera necesario)
      if (Array.isArray(out.positions)) {
        out.positions = new Float32Array(out.positions);
      }

      // Normalizar colores
      if (Array.isArray(out.colors)) {
        if (Array.isArray(out.colors[0])) {
          const colors = new Float32Array(out.colors.length * 3);
          let idx = 0;
          for (let i = 0; i < out.colors.length; i++) {
            let [r, g, b] = out.colors[i];
            if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
            colors[idx++] = r; colors[idx++] = g; colors[idx++] = b;
          }
          out.colors = colors;
        } else {
          out.colors = new Float32Array(out.colors);
        }
      }

      processed.push(out);
    }

    postMessage({ id, files: processed });

  } catch (err: any) {
    postMessage({ id, error: err?.message || err });
  }
});
