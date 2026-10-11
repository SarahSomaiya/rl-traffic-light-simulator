import * as THREE from 'three';
import { Vehicle } from '../sim/Vehicle';
import { LaneNetwork } from '../sim/Lane';

interface PooledVehicleMesh {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  inUse: boolean;
}

/**
 * Manages procedural 3D vehicle models and high-performance object pooling.
 */
export class VehicleMeshPool {
  private scene: THREE.Scene;
  private laneNetwork: LaneNetwork;
  private pool: PooledVehicleMesh[] = [];

  // Shared geometries and materials
  private bodyGeometry: THREE.BufferGeometry;
  private cabinGeometry: THREE.BufferGeometry;
  private wheelGeometry: THREE.BufferGeometry;
  private lightGeometry: THREE.BufferGeometry;

  private cabinMaterial: THREE.MeshStandardMaterial;
  private wheelMaterial: THREE.MeshStandardMaterial;
  private headlightMaterial: THREE.MeshStandardMaterial;
  private taillightMaterial: THREE.MeshStandardMaterial;

  // Cached body materials by color to avoid duplicates
  private bodyMaterialCache: Map<number, THREE.MeshStandardMaterial> = new Map();

  constructor(scene: THREE.Scene, laneNetwork: LaneNetwork) {
    this.scene = scene;
    this.laneNetwork = laneNetwork;

    // 1. Shared Geometries
    this.bodyGeometry = new THREE.BoxGeometry(1.85, 0.62, 4.2);
    this.cabinGeometry = new THREE.BoxGeometry(1.55, 0.52, 2.2);
    this.wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 10);
    this.lightGeometry = new THREE.BoxGeometry(0.36, 0.14, 0.05);

    // 2. Shared Materials
    this.cabinMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.8
    });

    this.wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.8,
      metalness: 0.2
    });

    this.headlightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.5,
      roughness: 0.3
    });

    this.taillightMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.4,
      roughness: 0.3
    });

    // Pre-populate pool with initial batch of 25 vehicles
    for (let i = 0; i < 25; i++) {
      this.createPooledMesh();
    }
  }

  private getBodyMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.bodyMaterialCache.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.4
      });
      this.bodyMaterialCache.set(colorHex, mat);
    }
    return mat;
  }

  private createPooledMesh(): PooledVehicleMesh {
    const group = new THREE.Group();
    group.name = 'VehicleMesh';

    // 1. Lower Body / Chassis
    const defaultMat = this.getBodyMaterial(0x06b6d4);
    const bodyMesh = new THREE.Mesh(this.bodyGeometry, defaultMat);
    bodyMesh.position.y = 0.55;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    // 2. Cabin / Greenhouse
    const cabin = new THREE.Mesh(this.cabinGeometry, this.cabinMaterial);
    cabin.position.set(0, 1.05, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // 3. Four Wheels
    const wheelPositions = [
      { x: -0.95, z: 1.25 },  // Front left
      { x: 0.95, z: 1.25 },   // Front right
      { x: -0.95, z: -1.25 }, // Rear left
      { x: 0.95, z: -1.25 }   // Rear right
    ];

    wheelPositions.forEach(wp => {
      const wheel = new THREE.Mesh(this.wheelGeometry, this.wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wp.x, 0.35, wp.z);
      wheel.castShadow = true;
      group.add(wheel);
    });

    // 4. Headlights (front facing along +Z local)
    const hlLeft = new THREE.Mesh(this.lightGeometry, this.headlightMaterial);
    hlLeft.position.set(-0.62, 0.6, 2.12);
    group.add(hlLeft);

    const hlRight = new THREE.Mesh(this.lightGeometry, this.headlightMaterial);
    hlRight.position.set(0.62, 0.6, 2.12);
    group.add(hlRight);

    // 5. Taillights (rear facing along -Z local)
    const tlLeft = new THREE.Mesh(this.lightGeometry, this.taillightMaterial);
    tlLeft.position.set(-0.62, 0.6, -2.12);
    group.add(tlLeft);

    const tlRight = new THREE.Mesh(this.lightGeometry, this.taillightMaterial);
    tlRight.position.set(0.62, 0.6, -2.12);
    group.add(tlRight);

    group.visible = false;
    this.scene.add(group);

    const pooled: PooledVehicleMesh = {
      group,
      bodyMesh,
      inUse: false
    };

    this.pool.push(pooled);
    return pooled;
  }

  /**
   * Synchronizes active 3D vehicle meshes with current headless simulation state.
   */
  public sync(vehicles: Vehicle[]): void {
    // Mark all currently pooled meshes as not in use
    this.pool.forEach(p => (p.inUse = false));

    for (const vehicle of vehicles) {
      const lane = this.laneNetwork.getLane(vehicle.laneId);
      if (!lane) continue;

      // Find available mesh in pool or expand pool
      let pooled = this.pool.find(p => !p.inUse);
      if (!pooled) {
        pooled = this.createPooledMesh();
      }

      pooled.inUse = true;
      pooled.group.visible = true;

      // Map longitudinal coordinate s to world position (X, Z)
      const coords = this.laneNetwork.getCoordinatesAt(vehicle.laneId, vehicle.s);
      pooled.group.position.set(coords.x, 0, coords.z);
      pooled.group.rotation.y = lane.heading;

      // Update body paint
      pooled.bodyMesh.material = this.getBodyMaterial(vehicle.colorHex);
    }

    // Hide inactive pooled meshes
    for (const p of this.pool) {
      if (!p.inUse) {
        p.group.visible = false;
      }
    }
  }

  public clear(): void {
    this.pool.forEach(p => {
      p.inUse = false;
      p.group.visible = false;
    });
  }

  public dispose(): void {
    this.pool.forEach(p => {
      this.scene.remove(p.group);
      p.group.clear();
    });
    this.pool = [];

    this.bodyGeometry.dispose();
    this.cabinGeometry.dispose();
    this.wheelGeometry.dispose();
    this.lightGeometry.dispose();

    this.cabinMaterial.dispose();
    this.wheelMaterial.dispose();
    this.headlightMaterial.dispose();
    this.taillightMaterial.dispose();

    this.bodyMaterialCache.forEach(mat => mat.dispose());
    this.bodyMaterialCache.clear();
  }
}
