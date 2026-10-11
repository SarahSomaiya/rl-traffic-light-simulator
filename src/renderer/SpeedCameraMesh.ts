import * as THREE from 'three';
import { SpeedCameraDefinition } from '../types';

/**
 * Procedural 3D roadside speed camera model.
 * Features pole, camera box, lens, equipment cabinet, and visual violation flash feedback.
 */
export class SpeedCameraMesh {
  public readonly id: string;
  private root: THREE.Group;
  private flashMesh: THREE.Mesh;
  private flashMaterial: THREE.MeshStandardMaterial;

  private isFlashing: boolean = false;
  private flashElapsed: number = 0;
  private flashDuration: number = 0.35; // Flash lasts 350ms

  // Geometries and materials to dispose
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(definition: SpeedCameraDefinition) {
    this.id = definition.id;
    this.root = new THREE.Group();
    this.root.name = `SpeedCamera_${definition.id}`;

    // Position roadside safely outside the vehicle lanes
    this.root.position.set(definition.worldX, 0, definition.worldZ);
    this.root.rotation.y = definition.rotationY;

    // 1. Materials
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Galvanized steel
      roughness: 0.4,
      metalness: 0.8
    });
    this.materials.push(poleMaterial);

    const housingMaterial = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // High-visibility safety yellow / amber camera housing
      roughness: 0.35,
      metalness: 0.3
    });
    this.materials.push(housingMaterial);

    const cabinetMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155, // Dark gray equipment cabinet
      roughness: 0.6,
      metalness: 0.5
    });
    this.materials.push(cabinetMaterial);

    const lensMaterial = new THREE.MeshStandardMaterial({
      color: 0x09090b, // Dark tinted optical lens
      roughness: 0.1,
      metalness: 0.9
    });
    this.materials.push(lensMaterial);

    this.flashMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.2
    });
    this.materials.push(this.flashMaterial);

    // 2. Base Plate
    const basePlateGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.1, 12);
    this.geometries.push(basePlateGeo);
    const basePlate = new THREE.Mesh(basePlateGeo, cabinetMaterial);
    basePlate.position.y = 0.05;
    this.root.add(basePlate);

    // 3. Equipment Cabinet (at ground)
    const cabinetGeo = new THREE.BoxGeometry(0.45, 0.75, 0.35);
    this.geometries.push(cabinetGeo);
    const cabinet = new THREE.Mesh(cabinetGeo, cabinetMaterial);
    cabinet.position.set(0, 0.45, 0);
    cabinet.castShadow = true;
    this.root.add(cabinet);

    // 4. Vertical Pole (3.6m tall)
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 3.6, 12);
    this.geometries.push(poleGeo);
    const pole = new THREE.Mesh(poleGeo, poleMaterial);
    pole.position.y = 1.8;
    pole.castShadow = true;
    this.root.add(pole);

    // 5. Horizontal Support Arm
    const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8);
    this.geometries.push(armGeo);
    const arm = new THREE.Mesh(armGeo, poleMaterial);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(0.35, 3.4, 0);
    arm.castShadow = true;
    this.root.add(arm);

    // 6. Camera Housing Box (angled towards oncoming road)
    const housingGeo = new THREE.BoxGeometry(0.45, 0.38, 0.65);
    this.geometries.push(housingGeo);
    const housing = new THREE.Mesh(housingGeo, housingMaterial);
    housing.position.set(0.75, 3.4, 0);
    housing.rotation.x = 0.08; // Slight downward tilt
    housing.castShadow = true;
    this.root.add(housing);

    // 7. Radar / Optical Lens (front face +Z local of housing)
    const lensGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16);
    this.geometries.push(lensGeo);
    const lens = new THREE.Mesh(lensGeo, lensMaterial);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.75, 3.4, 0.33);
    this.root.add(lens);

    // 8. Violation Strobe Flash Unit (above lens)
    const flashGeo = new THREE.BoxGeometry(0.24, 0.09, 0.06);
    this.geometries.push(flashGeo);
    this.flashMesh = new THREE.Mesh(flashGeo, this.flashMaterial);
    this.flashMesh.position.set(0.75, 3.52, 0.33);
    this.root.add(this.flashMesh);
  }

  public getRoot(): THREE.Group {
    return this.root;
  }

  /**
   * Triggers the visual flash strobe when a speed violation occurs.
   */
  public triggerViolationFlash(): void {
    this.isFlashing = true;
    this.flashElapsed = 0;
    this.flashMaterial.emissive.setHex(0xffffff);
    this.flashMaterial.emissiveIntensity = 2.5;
  }

  /**
   * Updates flash decay over time.
   */
  public update(dt: number): void {
    if (this.isFlashing) {
      this.flashElapsed += dt;
      if (this.flashElapsed >= this.flashDuration) {
        this.isFlashing = false;
        this.flashMaterial.emissive.setHex(0x000000);
        this.flashMaterial.emissiveIntensity = 0;
      } else {
        // Fade out
        const factor = 1 - this.flashElapsed / this.flashDuration;
        this.flashMaterial.emissiveIntensity = 2.5 * factor;
      }
    }
  }

  public dispose(): void {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose());
    this.geometries = [];
    this.materials = [];
    this.root.clear();
  }
}
