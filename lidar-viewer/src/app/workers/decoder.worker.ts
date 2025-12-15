addEventListener('message', (ev) => {
  const d = ev.data;
  if (d?.type === 'decode') {
    const positions = new Float32Array(d.buffer);
    (postMessage as any)({ type: 'decoded', buffer: positions.buffer }, [positions.buffer as any]);
  }
});
