import { Vector3, Box3, Sphere, Raycaster, Plane } from 'three';

export interface CameraConstraints {
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  enableDamping: boolean;
  dampingFactor: number;
  enableZoom: boolean;
  enableRotate: boolean;
  enablePan: boolean;
  panSpeed: number;
  rotateSpeed: number;
  zoomSpeed: number;
}

export interface BoundingVolume {
  type: 'box' | 'sphere';
  box?: Box3;
  sphere?: Sphere;
  center: Vector3;
  radius?: number;
  size?: Vector3;
}

export class CameraConstraintManager {
  private constraints: CameraConstraints;
  private boundingVolume: BoundingVolume;
  private collisionRaycaster: Raycaster;

  constructor(boundingVolume: BoundingVolume, constraints?: Partial<CameraConstraints>) {
    this.boundingVolume = boundingVolume;
    this.constraints = {
      minDistance: 0.1,
      maxDistance: 10000,
      minPolarAngle: 0,
      maxPolarAngle: Math.PI,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
      enableDamping: true,
      dampingFactor: 0.05,
      enableZoom: true,
      enableRotate: true,
      enablePan: true,
      panSpeed: 1.0,
      rotateSpeed: 1.0,
      zoomSpeed: 1.0,
      ...constraints
    };

    this.collisionRaycaster = new Raycaster();
  }

  applyConstraints(cameraPosition: Vector3, target: Vector3): Vector3 {
    const constrainedPosition = cameraPosition.clone();
    
    const distance = cameraPosition.distanceTo(target);
    const constrainedDistance = Math.max(
      this.constraints.minDistance,
      Math.min(this.constraints.maxDistance, distance)
    );

    if (distance !== constrainedDistance) {
      const direction = cameraPosition.clone().sub(target).normalize();
      constrainedPosition.copy(target).add(direction.multiplyScalar(constrainedDistance));
    }

    if (!this.isPointInsideVolume(constrainedPosition)) {
      constrainedPosition.copy(this.getClosestPointInVolume(constrainedPosition));
    }

    const groundLevel = this.boundingVolume.center.y - (this.boundingVolume.radius || this.boundingVolume.size?.y || 0) / 2;
    if (constrainedPosition.y < groundLevel + this.constraints.minDistance) {
      constrainedPosition.y = groundLevel + this.constraints.minDistance;
    }

    return constrainedPosition;
  }

  private isPointInsideVolume(point: Vector3): boolean {
    if (this.boundingVolume.type === 'sphere' && this.boundingVolume.sphere) {
      return this.boundingVolume.sphere.containsPoint(point);
    } else if (this.boundingVolume.type === 'box' && this.boundingVolume.box) {
      return this.boundingVolume.box.containsPoint(point);
    }
    return true;
  }

  private getClosestPointInVolume(point: Vector3): Vector3 {
    if (this.boundingVolume.type === 'sphere' && this.boundingVolume.sphere) {
      return this.boundingVolume.sphere.clampPoint(point, new Vector3());
    } else if (this.boundingVolume.type === 'box' && this.boundingVolume.box) {
      return this.boundingVolume.box.clampPoint(point, new Vector3());
    }
    return point.clone();
  }

  calculateBoundsFromPoints(points: Vector3[]): BoundingVolume {
    if (points.length === 0) {
      return {
        type: 'sphere',
        center: new Vector3(0, 0, 0),
        radius: 10
      };
    }

    const box = new Box3();
    points.forEach(point => box.expandByPoint(point));

    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const radius = size.length() / 2;

    const margin = radius * 0.1;
    box.expandByScalar(margin);

    return {
      type: 'box',
      box: box,
      sphere: new Sphere(center, radius + margin),
      center: center,
      radius: radius + margin,
      size: size
    };
  }

  updateBoundingVolume(volume: BoundingVolume): void {
    this.boundingVolume = volume;
  }

  updateConstraints(constraints: Partial<CameraConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
  }

  getConstraints(): CameraConstraints {
    return { ...this.constraints };
  }

  getBoundingVolume(): BoundingVolume {
    return { ...this.boundingVolume };
  }
}