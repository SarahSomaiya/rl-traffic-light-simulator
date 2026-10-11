import * as THREE from 'three';
import { Direction, LightState } from '../types';

export interface TrafficLightMeshOptions {
  direction: Direction;
  position: THREE.Vector3;
  rotationY: number; // in radians
  initialState?: LightState;
}

/**
 * Reusable 3D Traffic Light signal model with pole, mast arm, housing, and 3-lens illumination.
 * Includes both forward-facing lenses and rear repeater indicators for 360-degree visibility.
 */
export class TrafficLightMesh {
  private group: THREE.Group;
  private direction: Direction;
  private currentState: LightState = 'red';

  // Front lens meshes
  private redLensMesh!: THREE.Mesh;
  private yellowLensMesh!: THREE.Mesh;
  private greenLensMesh!: THREE.Mesh;

  // Rear repeater indicator meshes (ensures signals are readable from any camera preset/orbit)
  private rearRedMesh!: THREE.Mesh;
  private rearYellowMesh!: THREE.Mesh;
  private rearGreenMesh!: THREE.Mesh;

  // Local glow light
  private glowLight!: THREE.PointLight;

  // Shared / tracked resources across instances
  private static sharedMaterials: {
    pole?: THREE.MeshStandardMaterial;
    housing?: THREE.MeshStandardMaterial;
    visor?: THREE.MeshStandardMaterial;
    redOff?: THREE.MeshStandardMaterial;
    redOn?: THREE.MeshStandardMaterial;
    yellowOff?: THREE.MeshStandardMaterial;
    yellowOn?: THREE.MeshStandardMaterial;
    greenOff?: THREE.MeshStandardMaterial;
    greenOn?: THREE.MeshStandardMaterial;
  } = {};

  private ownGeometries: THREE.BufferGeometry[] = [];

  constructor(options: TrafficLightMeshOptions) {
    this.direction = options.direction;
    this.group = new THREE.Group();
    this.group.name = `TrafficLight_${options.direction}`;
    this.group.position.copy(options.position);
    this.group.rotation.y = options.rotationY;

    this.initMaterials();
    this.buildModel();
    this.setSignalState(options.initialState ?? 'red');
  }

  public getRoot(): THREE.Group {
    return this.group;
  }

  public getDirection(): Direction {
    return this.direction;
  }

  public getSignalState(): LightState {
    return this.currentState;
  }

  private initMaterials(): void {
    const sm = TrafficLightMesh.sharedMaterials;

    if (!sm.pole) {
      sm.pole = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.8,
        roughness: 0.3
      });
    }

    if (!sm.housing) {
      sm.housing = new THREE.MeshStandardMaterial({
        color: 0x111827,
        metalness: 0.5,
        roughness: 0.6
      });
    }

    if (!sm.visor) {
      sm.visor = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.3,
        roughness: 0.8
      });
    }

    // Lens Materials - OFF (dim)
    if (!sm.redOff) {
      sm.redOff = new THREE.MeshStandardMaterial({
        color: 0x450a0a,
        emissive: 0x1f0404,
        emissiveIntensity: 0.2,
        roughness: 0.5
      });
    }
    if (!sm.yellowOff) {
      sm.yellowOff = new THREE.MeshStandardMaterial({
        color: 0x451a03,
        emissive: 0x240d02,
        emissiveIntensity: 0.2,
        roughness: 0.5
      });
    }
    if (!sm.greenOff) {
      sm.greenOff = new THREE.MeshStandardMaterial({
        color: 0x052e16,
        emissive: 0x02170b,
        emissiveIntensity: 0.2,
        roughness: 0.5
      });
    }

    // Lens Materials - ON (bright emissive bloom)
    if (!sm.redOn) {
      sm.redOn = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 2.4,
        roughness: 0.2
      });
    }
    if (!sm.yellowOn) {
      sm.yellowOn = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 2.4,
        roughness: 0.2
      });
    }
    if (!sm.greenOn) {
      sm.greenOn = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 2.4,
        roughness: 0.2
      });
    }
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownGeometries.push(geo);
    return geo;
  }

  private buildModel(): void {
    const sm = TrafficLightMesh.sharedMaterials;

    // 1. Vertical Pole (height 6.8m)
    const poleHeight = 6.8;
    const poleGeo = this.trackGeometry(new THREE.CylinderGeometry(0.18, 0.22, poleHeight, 10));
    const poleMesh = new THREE.Mesh(poleGeo, sm.pole);
    poleMesh.position.y = poleHeight / 2;
    poleMesh.castShadow = true;
    this.group.add(poleMesh);

    // 2. Horizontal Mast Arm extending toward oncoming lanes (length 3.6m)
    const armLength = 3.6;
    const armGeo = this.trackGeometry(new THREE.CylinderGeometry(0.12, 0.16, armLength, 8));
    const armMesh = new THREE.Mesh(armGeo, sm.pole);
    armMesh.rotation.z = Math.PI / 2;
    armMesh.position.set(-armLength / 2, poleHeight - 0.3, 0);
    armMesh.castShadow = true;
    this.group.add(armMesh);

    // 3. Signal Head Assembly (attached near the end of the mast arm)
    const headGroup = new THREE.Group();
    headGroup.position.set(-armLength + 0.6, poleHeight - 1.2, 0);

    // Vertical hanger rod
    const hangerGeo = this.trackGeometry(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6));
    const hanger = new THREE.Mesh(hangerGeo, sm.pole);
    hanger.position.set(0, 0.9, 0);
    headGroup.add(hanger);

    // Signal Housing (rectangular box: W=0.95, H=2.6, D=0.65)
    const housingWidth = 0.95;
    const housingHeight = 2.6;
    const housingDepth = 0.65;
    const housingGeo = this.trackGeometry(
      new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth)
    );
    const housing = new THREE.Mesh(housingGeo, sm.housing);
    housing.castShadow = true;
    headGroup.add(housing);

    // Backplate border (dark trim for high contrast)
    const backplateGeo = this.trackGeometry(
      new THREE.BoxGeometry(housingWidth + 0.25, housingHeight + 0.25, 0.05)
    );
    const backplate = new THREE.Mesh(backplateGeo, sm.housing);
    backplate.position.set(0, 0, -0.05);
    headGroup.add(backplate);

    // 4. Vertically arranged lenses: Red (top), Yellow (mid), Green (bot)
    const lensRadius = 0.28;
    const lensGeo = this.trackGeometry(new THREE.CylinderGeometry(lensRadius, lensRadius, 0.14, 16));
    const rearLensGeo = this.trackGeometry(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12));
    const visorGeo = this.trackGeometry(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 12, 1, true, 0, Math.PI));

    const lensYOffsets = [0.75, 0.0, -0.75]; // Red, Yellow, Green

    // Forward lenses
    this.redLensMesh = new THREE.Mesh(lensGeo, sm.redOff);
    this.redLensMesh.rotation.x = Math.PI / 2;
    this.redLensMesh.position.set(0, lensYOffsets[0], housingDepth / 2 + 0.04);
    headGroup.add(this.redLensMesh);

    this.yellowLensMesh = new THREE.Mesh(lensGeo, sm.yellowOff);
    this.yellowLensMesh.rotation.x = Math.PI / 2;
    this.yellowLensMesh.position.set(0, lensYOffsets[1], housingDepth / 2 + 0.04);
    headGroup.add(this.yellowLensMesh);

    this.greenLensMesh = new THREE.Mesh(lensGeo, sm.greenOff);
    this.greenLensMesh.rotation.x = Math.PI / 2;
    this.greenLensMesh.position.set(0, lensYOffsets[2], housingDepth / 2 + 0.04);
    headGroup.add(this.greenLensMesh);

    // Rear repeater lenses (enables 360-degree signal visibility from any camera angle)
    this.rearRedMesh = new THREE.Mesh(rearLensGeo, sm.redOff);
    this.rearRedMesh.rotation.x = -Math.PI / 2;
    this.rearRedMesh.position.set(0, lensYOffsets[0], -(housingDepth / 2 + 0.08));
    headGroup.add(this.rearRedMesh);

    this.rearYellowMesh = new THREE.Mesh(rearLensGeo, sm.yellowOff);
    this.rearYellowMesh.rotation.x = -Math.PI / 2;
    this.rearYellowMesh.position.set(0, lensYOffsets[1], -(housingDepth / 2 + 0.08));
    headGroup.add(this.rearYellowMesh);

    this.rearGreenMesh = new THREE.Mesh(rearLensGeo, sm.greenOff);
    this.rearGreenMesh.rotation.x = -Math.PI / 2;
    this.rearGreenMesh.position.set(0, lensYOffsets[2], -(housingDepth / 2 + 0.08));
    headGroup.add(this.rearGreenMesh);

    // Sun visors over forward lenses
    lensYOffsets.forEach(y => {
      const visor = new THREE.Mesh(visorGeo, sm.visor);
      visor.rotation.x = Math.PI / 2;
      visor.rotation.z = Math.PI;
      visor.position.set(0, y + 0.08, housingDepth / 2 + 0.1);
      headGroup.add(visor);
    });

    // 5. Dynamic signal glow light for gaming atmosphere
    this.glowLight = new THREE.PointLight(0xef4444, 1.4, 10.0);
    this.glowLight.position.set(0, 0.75, housingDepth / 2 + 0.4);
    headGroup.add(this.glowLight);

    this.group.add(headGroup);
  }

  /**
   * Updates the signal lens illumination state ('red' | 'yellow' | 'green').
   */
  public setSignalState(state: LightState): void {
    this.currentState = state;
    const sm = TrafficLightMesh.sharedMaterials;

    // Reset all forward and rear lenses to dim
    this.redLensMesh.material = sm.redOff!;
    this.yellowLensMesh.material = sm.yellowOff!;
    this.greenLensMesh.material = sm.greenOff!;

    this.rearRedMesh.material = sm.redOff!;
    this.rearYellowMesh.material = sm.yellowOff!;
    this.rearGreenMesh.material = sm.greenOff!;

    switch (state) {
      case 'red':
        this.redLensMesh.material = sm.redOn!;
        this.rearRedMesh.material = sm.redOn!;
        this.glowLight.color.setHex(0xef4444);
        this.glowLight.position.y = 0.75;
        this.glowLight.intensity = 1.4;
        break;
      case 'yellow':
        this.yellowLensMesh.material = sm.yellowOn!;
        this.rearYellowMesh.material = sm.yellowOn!;
        this.glowLight.color.setHex(0xf59e0b);
        this.glowLight.position.y = 0.0;
        this.glowLight.intensity = 1.4;
        break;
      case 'green':
        this.greenLensMesh.material = sm.greenOn!;
        this.rearGreenMesh.material = sm.greenOn!;
        this.glowLight.color.setHex(0x10b981);
        this.glowLight.position.y = -0.75;
        this.glowLight.intensity = 1.6;
        break;
    }
  }

  /**
   * Clean disposal of non-shared geometries and group hierarchy.
   */
  public dispose(): void {
    this.ownGeometries.forEach(geo => geo.dispose());
    this.ownGeometries = [];
    this.group.clear();
  }
}
