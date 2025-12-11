/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const { type, payload } = data;

  switch (type) {
    case 'process-point-cloud':
      const processed = processPointCloudData(
        payload.points, 
        payload.colors, 
        payload.hasColors
      );
      postMessage({ type: 'point-cloud-processed', data: processed });
      break;

    case 'create-geometry':
      const geometry = createBufferGeometry(payload.points, payload.colors);
      postMessage({ type: 'geometry-created', data: geometry });
      break;

    case 'calculate-normals':
      const normals = calculatePointNormals(payload.points);
      postMessage({ type: 'normals-calculated', data: normals });
      break;
  }
});

function processPointCloudData(
  points: number[][], 
  colors: number[][] | null, 
  hasColors: boolean
): any {
  // Procesamiento pesado en worker
  const processedPoints = [];
  const processedColors = [];

  // Aplicar filtros y transformaciones
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Filtrar puntos fuera de rango
    if (isValidPoint(point)) {
      processedPoints.push(point);
      
      if (hasColors && colors && colors[i]) {
        processedColors.push(colors[i]);
      }
    }
  }

  return {
    points: processedPoints,
    colors: processedColors.length > 0 ? processedColors : null,
    originalCount: points.length,
    processedCount: processedPoints.length,
    reductionPercentage: ((points.length - processedPoints.length) / points.length) * 100
  };
}

function createBufferGeometry(points: number[][], colors: number[][] | null): any {
  const positions = new Float32Array(points.length * 3);
  const colorArray = colors ? new Float32Array(points.length * 3) : null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    positions[i * 3] = point[0];
    positions[i * 3 + 1] = point[1];
    positions[i * 3 + 2] = point[2];

    if (colorArray && colors && colors[i]) {
      colorArray[i * 3] = colors[i][0];
      colorArray[i * 3 + 1] = colors[i][1];
      colorArray[i * 3 + 2] = colors[i][2];
    }
  }

  return {
    positions: positions.buffer,
    colors: colorArray ? colorArray.buffer : null,
    pointCount: points.length
  };
}

function calculatePointNormals(points: number[][]): Float32Array {
  // Cálculo complejo de normales
  const normals = new Float32Array(points.length * 3);
  
  // Implementación de cálculo de normales por vecinos
  // (simplificado para el ejemplo)
  for (let i = 0; i < points.length; i++) {
    normals[i * 3] = 0;     // X
    normals[i * 3 + 1] = 0; // Y
    normals[i * 3 + 2] = 1; // Z (normal hacia arriba por defecto)
  }
  
  return normals;
}

function isValidPoint(point: number[]): boolean {
  // Validar que el punto tenga coordenadas finitas
  return point.every(coord => isFinite(coord) && !isNaN(coord));
}