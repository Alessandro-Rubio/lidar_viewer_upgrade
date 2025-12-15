addEventListener('message', (ev) => {
  const data = ev.data;
  if (data?.type === 'process') {
    const positions = new Float32Array(data.buffer);
    // simple centering
    let cx = 0, cy = 0, cz = 0;
    const n = positions.length / 3;
    for (let i = 0; i < positions.length; i += 3) {
      cx += positions[i]; cy += positions[i+1]; cz += positions[i+2];
    }
    if (n > 0) { cx /= n; cy /= n; cz /= n; }
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= cx; positions[i+1] -= cy; positions[i+2] -= cz;
    }
    // Use a cast to any to avoid TS compile error for transfer array argument
    (postMessage as any)({ type: 'processed', buffer: positions.buffer }, [positions.buffer as any]);
  }
});
