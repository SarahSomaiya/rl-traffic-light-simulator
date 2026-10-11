import * as THREE from 'three';
import { Vehicle } from '../sim/Vehicle';
import { LaneNetwork } from '../sim/Lane';
import { VehicleType } from '../types';

interface PooledVehicleMesh {
  type: VehicleType;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  emergencyLeftLight?: THREE.Mesh;
  emergencyRightLight?: THREE.Mesh;
  taxiSignMesh?: THREE.Mesh;
  inUse: boolean;
}

/**
 * Manages procedural 3D vehicle models for all 7 vehicle classes with
 * distinct geometry, object pooling, and deterministic emergency lighting effects.
 */
export class VehicleMeshPool {
  private scene: THREE.Scene;
  private laneNetwork: LaneNetwork;
  private pool: PooledVehicleMesh[] = [];

  // Shared generic materials
  private windowMaterial: THREE.MeshStandardMaterial;
  private wheelMaterial: THREE.MeshStandardMaterial;
  private headlightMaterial: THREE.MeshStandardMaterial;
  private taillightMaterial: THREE.MeshStandardMaterial;
  private taxiSignMaterial: THREE.MeshStandardMaterial;
  private emergencyBlueMaterial: THREE.MeshStandardMaterial;
  private emergencyRedMaterial: THREE.MeshStandardMaterial;
  private emergencyDimMaterial: THREE.MeshStandardMaterial;
  private policeDecalMaterial: THREE.MeshStandardMaterial;
  private ambulanceCrossMaterial: THREE.MeshStandardMaterial;

  // Cached body paint materials by color hex
  private bodyMaterialCache: Map<number, THREE.MeshStandardMaterial> = new Map();

  // Shared geometries
  private wheelGeometry: THREE.CylinderGeometry;
  private headlightGeometry: THREE.BoxGeometry;
  private taillightGeometry: THREE.BoxGeometry;

  constructor(scene: THREE.Scene, laneNetwork: LaneNetwork) {
    this.scene = scene;
    this.laneNetwork = laneNetwork;

    // 1. Shared Materials
    this.windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      metalness: 0.85
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

    this.taxiSignMaterial = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 1.2,
      roughness: 0.2
    });

    this.emergencyBlueMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x2563eb,
      emissiveIntensity: 2.5,
      roughness: 0.2
    });

    this.emergencyRedMaterial = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 2.5,
      roughness: 0.2
    });

    this.emergencyDimMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.5
    });

    this.policeDecalMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4
    });

    this.ambulanceCrossMaterial = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x991b1b,
      emissiveIntensity: 0.4
    });

    // 2. Shared Geometries
    this.wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 12);
    this.headlightGeometry = new THREE.BoxGeometry(0.32, 0.14, 0.05);
    this.taillightGeometry = new THREE.BoxGeometry(0.32, 0.14, 0.05);

    // 3. Pre-populate pool with diverse vehicle classes
    const initialTypes: VehicleType[] = [
      'sedan', 'sedan', 'sedan', 'sedan', 'sedan', 'sedan',
      'hatchback', 'hatchback', 'hatchback', 'hatchback', 'hatchback',
      'suv', 'suv', 'suv',
      'taxi', 'taxi',
      'van', 'van',
      'police', 'ambulance'
    ];

    initialTypes.forEach(t => this.createPooledMesh(t));
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

  /**
   * Constructs procedural 3D model specific to vehicle type.
   */
  private createPooledMesh(type: VehicleType): PooledVehicleMesh {
    const group = new THREE.Group();
    group.name = `VehicleMesh_${type}`;

    let bodyMesh: THREE.Mesh;
    let emergencyLeft: THREE.Mesh | undefined;
    let emergencyRight: THREE.Mesh | undefined;
    let taxiSign: THREE.Mesh | undefined;

    const defaultColor = 0x3b82f6;

    switch (type) {
      case 'hatchback': {
        // Compact 3.85m hatchback
        const bodyGeo = new THREE.BoxGeometry(1.72, 0.58, 3.85);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(defaultColor));
        bodyMesh.position.y = 0.54;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // Sloping compact greenhouse
        const cabinGeo = new THREE.BoxGeometry(1.48, 0.52, 2.0);
        const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
        cabin.position.set(0, 1.05, -0.2);
        cabin.castShadow = true;
        group.add(cabin);

        this.addWheels(group, 0.88, 1.15, -1.15);
        this.addLights(group, 0.55, 0.58, 1.93, -1.93);
        break;
      }

      case 'suv': {
        // Full-Size SUV (tall, wide, rugged)
        const bodyGeo = new THREE.BoxGeometry(1.96, 0.85, 4.95);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(defaultColor));
        bodyMesh.position.y = 0.72;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // High boxy cabin
        const cabinGeo = new THREE.BoxGeometry(1.72, 0.65, 3.1);
        const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
        cabin.position.set(0, 1.42, -0.15);
        cabin.castShadow = true;
        group.add(cabin);

        // Roof rails
        const railGeo = new THREE.BoxGeometry(0.08, 0.08, 2.6);
        const railL = new THREE.Mesh(railGeo, this.windowMaterial);
        railL.position.set(-0.75, 1.78, -0.15);
        group.add(railL);
        const railR = new THREE.Mesh(railGeo, this.windowMaterial);
        railR.position.set(0.75, 1.78, -0.15);
        group.add(railR);

        this.addWheels(group, 1.0, 1.5, -1.5, 0.42);
        this.addLights(group, 0.65, 0.8, 2.48, -2.48);
        break;
      }

      case 'taxi': {
        // Sedan chassis in yellow taxi livery with roof TAXI sign
        const bodyGeo = new THREE.BoxGeometry(1.80, 0.62, 4.60);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(0xfacc15));
        bodyMesh.position.y = 0.56;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const cabinGeo = new THREE.BoxGeometry(1.52, 0.54, 2.4);
        const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
        cabin.position.set(0, 1.10, -0.1);
        cabin.castShadow = true;
        group.add(cabin);

        // Illuminated TAXI roof sign
        const signGeo = new THREE.BoxGeometry(0.65, 0.18, 0.28);
        taxiSign = new THREE.Mesh(signGeo, this.taxiSignMaterial);
        taxiSign.position.set(0, 1.44, -0.1);
        group.add(taxiSign);

        this.addWheels(group, 0.92, 1.35, -1.35);
        this.addLights(group, 0.60, 0.60, 2.31, -2.31);
        break;
      }

      case 'police': {
        // Police Patrol Cruiser with dark/white livery and roof emergency light bar
        const bodyGeo = new THREE.BoxGeometry(1.86, 0.64, 4.80);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(0x1e293b));
        bodyMesh.position.y = 0.58;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // White door accent panels
        const doorPanelGeo = new THREE.BoxGeometry(1.88, 0.42, 1.8);
        const doorPanels = new THREE.Mesh(doorPanelGeo, this.policeDecalMaterial);
        doorPanels.position.set(0, 0.62, -0.1);
        group.add(doorPanels);

        // Cabin
        const cabinGeo = new THREE.BoxGeometry(1.54, 0.54, 2.45);
        const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
        cabin.position.set(0, 1.12, -0.1);
        cabin.castShadow = true;
        group.add(cabin);

        // Emergency Roof Light Bar (Left Blue, Right Red)
        const lightBarMount = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.06, 0.2),
          this.windowMaterial
        );
        lightBarMount.position.set(0, 1.42, -0.1);
        group.add(lightBarMount);

        const strobeGeo = new THREE.BoxGeometry(0.38, 0.12, 0.18);
        emergencyLeft = new THREE.Mesh(strobeGeo, this.emergencyDimMaterial);
        emergencyLeft.position.set(-0.25, 1.48, -0.1);
        group.add(emergencyLeft);

        emergencyRight = new THREE.Mesh(strobeGeo, this.emergencyDimMaterial);
        emergencyRight.position.set(0.25, 1.48, -0.1);
        group.add(emergencyRight);

        this.addWheels(group, 0.95, 1.4, -1.4);
        this.addLights(group, 0.62, 0.62, 2.41, -2.41);
        break;
      }

      case 'ambulance': {
        // High-roof emergency ambulance with white body, red stripe, and light bar
        const bodyGeo = new THREE.BoxGeometry(2.12, 1.35, 5.65);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(0xffffff));
        bodyMesh.position.y = 1.05;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // Red medical cross / stripe box
        const stripeGeo = new THREE.BoxGeometry(2.14, 0.26, 3.8);
        const stripe = new THREE.Mesh(stripeGeo, this.ambulanceCrossMaterial);
        stripe.position.set(0, 1.15, -0.3);
        group.add(stripe);

        // Front cab windshield
        const cabGeo = new THREE.BoxGeometry(1.85, 0.58, 1.6);
        const cab = new THREE.Mesh(cabGeo, this.windowMaterial);
        cab.position.set(0, 1.62, 1.3);
        group.add(cab);

        // Roof Emergency Light Bar
        const strobeGeo = new THREE.BoxGeometry(0.42, 0.14, 0.22);
        emergencyLeft = new THREE.Mesh(strobeGeo, this.emergencyDimMaterial);
        emergencyLeft.position.set(-0.4, 1.82, 1.4);
        group.add(emergencyLeft);

        emergencyRight = new THREE.Mesh(strobeGeo, this.emergencyDimMaterial);
        emergencyRight.position.set(0.4, 1.82, 1.4);
        group.add(emergencyRight);

        this.addWheels(group, 1.08, 1.7, -1.7, 0.42);
        this.addLights(group, 0.72, 0.8, 2.83, -2.83);
        break;
      }

      case 'van': {
        // Boxy delivery cargo van
        const bodyGeo = new THREE.BoxGeometry(2.05, 1.35, 5.45);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(0xe2e8f0));
        bodyMesh.position.y = 1.0;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // Windshield and driver cabin windows
        const windshieldGeo = new THREE.BoxGeometry(1.82, 0.55, 1.2);
        const windshield = new THREE.Mesh(windshieldGeo, this.windowMaterial);
        windshield.position.set(0, 1.55, 1.7);
        group.add(windshield);

        this.addWheels(group, 1.05, 1.6, -1.6, 0.40);
        this.addLights(group, 0.70, 0.75, 2.73, -2.73);
        break;
      }

      case 'sedan':
      default: {
        // Classic three-box sedan
        const bodyGeo = new THREE.BoxGeometry(1.80, 0.62, 4.65);
        bodyMesh = new THREE.Mesh(bodyGeo, this.getBodyMaterial(defaultColor));
        bodyMesh.position.y = 0.56;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const cabinGeo = new THREE.BoxGeometry(1.52, 0.54, 2.45);
        const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
        cabin.position.set(0, 1.10, -0.1);
        cabin.castShadow = true;
        group.add(cabin);

        this.addWheels(group, 0.92, 1.35, -1.35);
        this.addLights(group, 0.60, 0.60, 2.33, -2.33);
        break;
      }
    }

    group.visible = false;
    this.scene.add(group);

    const pooled: PooledVehicleMesh = {
      type,
      group,
      bodyMesh,
      emergencyLeftLight: emergencyLeft,
      emergencyRightLight: emergencyRight,
      taxiSignMesh: taxiSign,
      inUse: false
    };

    this.pool.push(pooled);
    return pooled;
  }

  private addWheels(
    group: THREE.Group,
    halfTrack: number,
    frontZ: number,
    rearZ: number,
    wheelRadius: number = 0.35
  ): void {
    const wheelPositions = [
      { x: -halfTrack, z: frontZ },
      { x: halfTrack, z: frontZ },
      { x: -halfTrack, z: rearZ },
      { x: halfTrack, z: rearZ }
    ];

    wheelPositions.forEach(wp => {
      const wheel = new THREE.Mesh(this.wheelGeometry, this.wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wp.x, wheelRadius, wp.z);
      wheel.castShadow = true;
      group.add(wheel);
    });
  }

  private addLights(
    group: THREE.Group,
    halfSpan: number,
    heightY: number,
    frontZ: number,
    rearZ: number
  ): void {
    // Headlights (+Z front)
    const hlL = new THREE.Mesh(this.headlightGeometry, this.headlightMaterial);
    hlL.position.set(-halfSpan, heightY, frontZ);
    group.add(hlL);

    const hlR = new THREE.Mesh(this.headlightGeometry, this.headlightMaterial);
    hlR.position.set(halfSpan, heightY, frontZ);
    group.add(hlR);

    // Taillights (-Z rear)
    const tlL = new THREE.Mesh(this.taillightGeometry, this.taillightMaterial);
    tlL.position.set(-halfSpan, heightY, rearZ);
    group.add(tlL);

    const tlR = new THREE.Mesh(this.taillightGeometry, this.taillightMaterial);
    tlR.position.set(halfSpan, heightY, rearZ);
    group.add(tlR);
  }

  /**
   * Synchronizes active 3D vehicle meshes with current simulation vehicles and
   * deterministically updates emergency beacon strobes based on simulation time.
   */
  public sync(vehicles: Vehicle[], simTime: number = 0): void {
    // Mark all currently pooled meshes as not in use
    this.pool.forEach(p => (p.inUse = false));

    // Flash phase for active emergency vehicles (deterministic: alternates at 4 Hz)
    const isFlashPhaseA = Math.floor(simTime * 4.0) % 2 === 0;

    for (const vehicle of vehicles) {
      const lane = this.laneNetwork.getLane(vehicle.laneId);
      if (!lane) continue;

      // Find available matching mesh of this type or create one
      let pooled = this.pool.find(p => !p.inUse && p.type === vehicle.type);
      if (!pooled) {
        pooled = this.createPooledMesh(vehicle.type);
      }

      pooled.inUse = true;
      pooled.group.visible = true;

      // Map longitudinal coordinate s to world position (X, Z)
      const coords = this.laneNetwork.getCoordinatesAt(vehicle.laneId, vehicle.s);
      pooled.group.position.set(coords.x, 0, coords.z);
      pooled.group.rotation.y = lane.heading;

      // Update body paint
      pooled.bodyMesh.material = this.getBodyMaterial(vehicle.colorHex);

      // Deterministic Emergency Light Flashing
      if (vehicle.isEmergencyActive && pooled.emergencyLeftLight && pooled.emergencyRightLight) {
        if (isFlashPhaseA) {
          pooled.emergencyLeftLight.material = this.emergencyBlueMaterial;
          pooled.emergencyRightLight.material = this.emergencyDimMaterial;
        } else {
          pooled.emergencyLeftLight.material = this.emergencyDimMaterial;
          pooled.emergencyRightLight.material = this.emergencyRedMaterial;
        }
      } else if (pooled.emergencyLeftLight && pooled.emergencyRightLight) {
        // Dim when inactive
        pooled.emergencyLeftLight.material = this.emergencyDimMaterial;
        pooled.emergencyRightLight.material = this.emergencyDimMaterial;
      }
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

    this.wheelGeometry.dispose();
    this.headlightGeometry.dispose();
    this.taillightGeometry.dispose();

    this.windowMaterial.dispose();
    this.wheelMaterial.dispose();
    this.headlightMaterial.dispose();
    this.taillightMaterial.dispose();
    this.taxiSignMaterial.dispose();
    this.emergencyBlueMaterial.dispose();
    this.emergencyRedMaterial.dispose();
    this.emergencyDimMaterial.dispose();
    this.policeDecalMaterial.dispose();
    this.ambulanceCrossMaterial.dispose();

    this.bodyMaterialCache.forEach(mat => mat.dispose());
    this.bodyMaterialCache.clear();
  }
}
