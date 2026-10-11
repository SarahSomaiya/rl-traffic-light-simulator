import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraPreset } from '../types';

export interface PresetConfig {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export const CAMERA_PRESETS: Record<CameraPreset, PresetConfig> = {
  isometric: {
    position: new THREE.Vector3(52, 64, 62),
    target: new THREE.Vector3(0, 0, 0)
  },
  overhead: {
    position: new THREE.Vector3(0, 98, 0.1),
    target: new THREE.Vector3(0, 0, 0)
  },
  street: {
    position: new THREE.Vector3(14, 4.5, 22),
    target: new THREE.Vector3(0, 2.2, 0)
  }
};

/**
 * Manages multi-mode camera presets and smooth OrbitControls navigation.
 */
export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private currentPreset: CameraPreset | null = 'isometric';

  // Smooth transition state
  private isTransitioning: boolean = false;
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private targetLookAt: THREE.Vector3 = new THREE.Vector3();
  private transitionSpeed: number = 5.5; // exponential lerp rate

  // Optional notification hook when preset changes or user starts manual orbit
  public onPresetChange?: (preset: CameraPreset | null) => void;

  private onControlStartBound: () => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(this.camera, domElement);

    // OrbitControls configuration for smooth gaming feel
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;

    // Ground collision & boundary guards
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent dipping beneath ground
    this.controls.minDistance = 10;
    this.controls.maxDistance = 180;

    // Cancel automatic transition if user manually drags/orbits with mouse
    this.onControlStartBound = () => {
      this.isTransitioning = false;
      this.currentPreset = null;
      this.onPresetChange?.(null);
    };
    this.controls.addEventListener('start', this.onControlStartBound);

    // Initialize with default isometric preset
    this.setPreset('isometric', false);
  }

  public getControls(): OrbitControls {
    return this.controls;
  }

  public getCurrentPreset(): CameraPreset | null {
    return this.currentPreset;
  }

  /**
   * Switches to a camera preset with optional smooth interpolation.
   */
  public setPreset(preset: CameraPreset, smooth: boolean = true): void {
    const config = CAMERA_PRESETS[preset];
    if (!config) return;

    this.currentPreset = preset;
    this.onPresetChange?.(preset);

    if (!smooth) {
      this.isTransitioning = false;
      this.camera.position.copy(config.position);
      this.controls.target.copy(config.target);
      this.controls.update();
    } else {
      this.isTransitioning = true;
      this.targetPosition.copy(config.position);
      this.targetLookAt.copy(config.target);
    }
  }

  /**
   * Ticks smooth transition and updates orbit damping.
   */
  public update(delta: number): void {
    if (this.isTransitioning) {
      const t = Math.min(1.0, 1.0 - Math.exp(-this.transitionSpeed * delta));

      this.camera.position.lerp(this.targetPosition, t);
      this.controls.target.lerp(this.targetLookAt, t);

      const posDist = this.camera.position.distanceTo(this.targetPosition);
      const targetDist = this.controls.target.distanceTo(this.targetLookAt);

      if (posDist < 0.08 && targetDist < 0.04) {
        this.camera.position.copy(this.targetPosition);
        this.controls.target.copy(this.targetLookAt);
        this.isTransitioning = false;
      }
    }

    this.controls.update();
  }

  /**
   * Handles canvas/window resize.
   */
  public handleResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public dispose(): void {
    this.controls.removeEventListener('start', this.onControlStartBound);
    this.controls.dispose();
  }
}
