import * as THREE from 'three';
import { RoadRenderer } from './RoadRenderer';
import { VehicleMeshPool } from './VehicleMeshPool';

export interface EnvironmentControllerOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  hemiLight: THREE.HemisphereLight;
  ambientLight: THREE.AmbientLight;
  sunLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  roadRenderer: RoadRenderer;
  vehicleMeshPool: VehicleMeshPool;
}

/**
 * Manages smooth Day/Night environmental transitions, lighting balances,
 * atmospheric sky/fog colors, warm intersection streetlights, and drives
 * emissive night illumination across buildings, street lamps, and vehicle headlights.
 */
export class EnvironmentController {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private hemiLight: THREE.HemisphereLight;
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private roadRenderer: RoadRenderer;
  private vehicleMeshPool: VehicleMeshPool;

  // Day/Night State
  private isNight: boolean = false;
  private currentProgress: number = 0.0; // 0.0 = Pure Day, 1.0 = Pure Night
  private targetProgress: number = 0.0;
  private transitionSpeed: number = 1.6; // ~0.62 seconds transition

  // 4 Corner Warm Intersection Street PointLights
  private streetPointLights: THREE.PointLight[] = [];

  // Day Color Constants
  private readonly daySkyColor = new THREE.Color(0xcad6e2);
  private readonly dayFogColor = new THREE.Color(0xcad6e2);
  private readonly daySunColor = new THREE.Color(0xfffaed);
  private readonly dayHemiSky = new THREE.Color(0xdbeafe);
  private readonly dayHemiGround = new THREE.Color(0x4a7c59);
  private readonly dayAmbientColor = new THREE.Color(0xffffff);
  private readonly dayFillColor = new THREE.Color(0x7dd3fc);

  // Night Color Constants (Rich blue-hour / early-night aesthetic with crisp atmospheric contrast)
  private readonly nightSkyColor = new THREE.Color(0x16243b);
  private readonly nightFogColor = new THREE.Color(0x16243b);
  private readonly nightMoonColor = new THREE.Color(0xa8cbf5);
  private readonly nightHemiSky = new THREE.Color(0x385473);
  private readonly nightHemiGround = new THREE.Color(0x1e2d3d);
  private readonly nightAmbientColor = new THREE.Color(0x486581);
  private readonly nightFillColor = new THREE.Color(0x1e3a8a);


  constructor(options: EnvironmentControllerOptions) {
    this.scene = options.scene;
    this.renderer = options.renderer;
    this.hemiLight = options.hemiLight;
    this.ambientLight = options.ambientLight;
    this.sunLight = options.sunLight;
    this.fillLight = options.fillLight;
    this.roadRenderer = options.roadRenderer;
    this.vehicleMeshPool = options.vehicleMeshPool;

    this.initStreetPointLights();
    this.applyTransition(0.0);
  }

  /**
   * Initializes 4 warm local street point lights at the 4 intersection corners.
   * Provides real-time dynamic warm illumination on roads, crosswalks, and passing vehicles at night
   * while keeping GPU overhead negligible.
   */
  private initStreetPointLights(): void {
    const corners = [
      { x: -9.8, z: -9.8 },
      { x: 9.8, z: -9.8 },
      { x: -9.8, z: 9.8 },
      { x: 9.8, z: 9.8 }
    ];

    corners.forEach(c => {
      const pLight = new THREE.PointLight(0xffedd5, 0.0, 36, 1.5);
      pLight.position.set(c.x, 5.2, c.z);
      this.scene.add(pLight);
      this.streetPointLights.push(pLight);
    });
  }

  /**
   * Toggles between Day and Night mode.
   * @returns true if night mode is now active, false if day mode
   */
  public toggleDayNight(): boolean {
    return this.setNightMode(!this.isNight);
  }

  /**
   * Explicitly sets Day or Night mode.
   * @param night true for Night, false for Day
   * @param immediate if true, jumps instantly without transition
   */
  public setNightMode(night: boolean, immediate: boolean = false): boolean {
    this.isNight = night;
    this.targetProgress = night ? 1.0 : 0.0;

    if (immediate) {
      this.currentProgress = this.targetProgress;
      this.applyTransition(this.currentProgress);
    }

    return this.isNight;
  }

  public isNightMode(): boolean {
    return this.isNight;
  }

  public getTransitionProgress(): number {
    return this.currentProgress;
  }

  /**
   * Updates smooth environmental transition interpolation each frame.
   */
  public update(delta: number): void {
    if (Math.abs(this.currentProgress - this.targetProgress) < 0.001) {
      if (this.currentProgress !== this.targetProgress) {
        this.currentProgress = this.targetProgress;
        this.applyTransition(this.currentProgress);
      }
      return;
    }

    const step = delta * this.transitionSpeed;
    if (this.currentProgress < this.targetProgress) {
      this.currentProgress = Math.min(this.targetProgress, this.currentProgress + step);
    } else {
      this.currentProgress = Math.max(this.targetProgress, this.currentProgress - step);
    }

    this.applyTransition(this.currentProgress);
  }

  /**
   * Applies the blended environmental lighting and material intensities for progress t in [0, 1].
   */
  private applyTransition(t: number): void {
    // 1. Sky & Fog (Crisp nocturnal atmosphere without deep void blackness)
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerpColors(this.daySkyColor, this.nightSkyColor, t);
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.lerpColors(this.dayFogColor, this.nightFogColor, t);
      this.scene.fog.near = THREE.MathUtils.lerp(120, 110, t);
      this.scene.fog.far = THREE.MathUtils.lerp(290, 280, t);
    }

    // 2. Exposure (Maintains city readability and texture detail without clipping emissives)
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.10, 1.06, t);

    // 3. Sun / Moon Directional Light (Crisp directional moonlight casting soft silhouettes)
    this.sunLight.color.lerpColors(this.daySunColor, this.nightMoonColor, t);
    this.sunLight.intensity = THREE.MathUtils.lerp(1.45, 0.68, t);

    // 4. Hemisphere Light (Keeps ground, grass, sidewalks, and building walls visible)
    this.hemiLight.color.lerpColors(this.dayHemiSky, this.nightHemiSky, t);
    this.hemiLight.groundColor.lerpColors(this.dayHemiGround, this.nightHemiGround, t);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.60, 0.54, t);

    // 5. Ambient Light (Rich slate-blue ambient fill avoiding pitch-black shadows)
    this.ambientLight.color.lerpColors(this.dayAmbientColor, this.nightAmbientColor, t);
    this.ambientLight.intensity = THREE.MathUtils.lerp(0.35, 0.42, t);

    // 6. Fill Light (Gentle cross-fill for facade depth)
    this.fillLight.color.lerpColors(this.dayFillColor, this.nightFillColor, t);
    this.fillLight.intensity = THREE.MathUtils.lerp(0.28, 0.24, t);

    // 7. Corner Intersection Street Point Lights (Warm local glow illuminating road & sidewalks)
    const streetLightIntensity = THREE.MathUtils.lerp(0.0, 1.80, t);
    this.streetPointLights.forEach(p => {
      p.intensity = streetLightIntensity;
    });

    // 8. Update Road Environment (streetlights, feathered pools & glowing building windows)
    this.roadRenderer.setNightTransition(t);

    // 9. Update Vehicle Lights (headlights, taillights & feathered beam projections)
    this.vehicleMeshPool.setNightTransition(t);
  }

  /**
   * Disposes point lights and resources.
   */
  public dispose(): void {
    this.streetPointLights.forEach(p => {
      this.scene.remove(p);
      p.dispose();
    });
    this.streetPointLights = [];
  }
}
