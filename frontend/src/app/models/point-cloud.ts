export interface PointCloudMetadata {
  file_name: string;
  total_points: number;
  original_points: number;
  bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    min_z: number;
    max_z: number;
  };
  has_colors: boolean;
  file_size: string;
}

export interface PointCloudStats {
  totalFiles: number;
  totalPoints: number;
  optimized: boolean;
  targetPointsPerFile: number;
  memoryUsage: number;
  renderTime: number;
}