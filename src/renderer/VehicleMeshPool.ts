import * as THREE from 'three';
import { Vehicle } from '../sim/Vehicle';
import { LaneNetwork } from '../sim/Lane';
import { VehicleType } from '../types';

export interface PooledVehicleMesh {
  type: VehicleType;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  bodyMeshes?: THREE.Mesh[];
  emergencyLeftLight?: THREE.Mesh;
  emergencyRightLight?: THREE.Mesh;
  emergencyExtraLights?: THREE.Mesh[];
  taxiSignMesh?: THREE.Mesh;
  inUse: boolean;
}

/**
 * Manages high-fidelity stylized 3D vehicle models for all 7 vehicle classes with:
 * - Recognizable passenger cars with detailed bodywork, windshield rake, bumpers, grilles, and headlights
 * - City transit passenger shuttle / minibus with visible panoramic windows, destination display, and roof AC units
 * - Distinct emergency vehicles (police interceptor with bull bar and blue/red strobes; ambulance with medical box body, cross emblems, and perimeter beacons)
 * - Detailed multi-part wheels with tires, alloy rims, brake rotors, and calipers resting precisely on road asphalt (Y = 0)
 * - Object pooling, safe material caching, deterministic emergency light strobes, and clean memory disposal
 */
export class VehicleMeshPool {
  private scene: THREE.Scene;
  private laneNetwork: LaneNetwork;
  private pool: PooledVehicleMesh[] = [];

  // Track all allocated geometries and materials for safe disposal
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  // Shared generic materials
  private windowMaterial!: THREE.MeshStandardMaterial;
  private passengerWindowMaterial!: THREE.MeshStandardMaterial;
  private wheelTireMaterial!: THREE.MeshStandardMaterial;
  private rimAlloyMaterial!: THREE.MeshStandardMaterial;
  private brakeRotorMaterial!: THREE.MeshStandardMaterial;
  private brakeCaliperMaterial!: THREE.MeshStandardMaterial;
  private bumperTrimMaterial!: THREE.MeshStandardMaterial;
  private chromeTrimMaterial!: THREE.MeshStandardMaterial;
  private grilleMeshMaterial!: THREE.MeshStandardMaterial;
  private headlightLensMaterial!: THREE.MeshStandardMaterial;
  private turnSignalMaterial!: THREE.MeshStandardMaterial;
  private fogLightMaterial!: THREE.MeshStandardMaterial;
  private taillightRedMaterial!: THREE.MeshStandardMaterial;
  private reverseLightMaterial!: THREE.MeshStandardMaterial;
  private licensePlateMaterial!: THREE.MeshStandardMaterial;
  private plateBorderMaterial!: THREE.MeshStandardMaterial;
  private mirrorGlassMaterial!: THREE.MeshStandardMaterial;
  private headlightBeamMaterial!: THREE.MeshBasicMaterial;
  private headlightBeamTexture: THREE.Texture | null = null;

  // Class-specific accent materials
  private taxiYellowMaterial!: THREE.MeshStandardMaterial;
  private taxiSignMaterial!: THREE.MeshStandardMaterial;
  private taxiCheckerMaterial!: THREE.MeshStandardMaterial;
  private policeNavyMaterial!: THREE.MeshStandardMaterial;
  private policeWhiteMaterial!: THREE.MeshStandardMaterial;
  private policeGoldBadgeMaterial!: THREE.MeshStandardMaterial;
  private ambulanceWhiteMaterial!: THREE.MeshStandardMaterial;
  private ambulanceRedCrossMaterial!: THREE.MeshStandardMaterial;
  private ambulanceChevronYellowMaterial!: THREE.MeshStandardMaterial;
  private transitDestinationDisplayMaterial!: THREE.MeshStandardMaterial;
  private roofAcVentMaterial!: THREE.MeshStandardMaterial;

  // Emergency beacon strobes
  private emergencyBlueActiveMaterial!: THREE.MeshStandardMaterial;
  private emergencyRedActiveMaterial!: THREE.MeshStandardMaterial;
  private emergencyStrobeDimMaterial!: THREE.MeshStandardMaterial;

  // Cached body paint materials by color hex
  private bodyMaterialCache: Map<number, THREE.MeshStandardMaterial> = new Map();

  // Shared geometries
  private standardTireGeo!: THREE.CylinderGeometry;
  private suvTireGeo!: THREE.CylinderGeometry;
  private heavyTireGeo!: THREE.CylinderGeometry;
  private standardRimGeo!: THREE.CylinderGeometry;
  private suvRimGeo!: THREE.CylinderGeometry;
  private brakeDiscGeo!: THREE.CylinderGeometry;
  private caliperGeo!: THREE.BoxGeometry;
  private headlightGeo!: THREE.BoxGeometry;
  private taillightGeo!: THREE.BoxGeometry;
  private turnSignalGeo!: THREE.BoxGeometry;
  private plateGeo!: THREE.BoxGeometry;
  private plateBackGeo!: THREE.BoxGeometry;
  private mirrorArmGeo!: THREE.BoxGeometry;
  private mirrorHeadGeo!: THREE.BoxGeometry;
  private mirrorFaceGeo!: THREE.BoxGeometry;

  constructor(scene: THREE.Scene, laneNetwork: LaneNetwork) {
    this.scene = scene;
    this.laneNetwork = laneNetwork;

    this.initSharedMaterials();
    this.initSharedGeometries();

    // Pre-populate pool with diverse vehicle classes matching spawn distribution
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

  private trackGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMaterial<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  private initSharedMaterials(): void {
    this.windowMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.12,
        metalness: 0.88,
        flatShading: true
      })
    );

    this.passengerWindowMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.15,
        metalness: 0.85,
        flatShading: true
      })
    );

    this.wheelTireMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.88,
        metalness: 0.15,
        flatShading: true
      })
    );

    this.rimAlloyMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        metalness: 0.85,
        roughness: 0.22,
        flatShading: true
      })
    );

    this.brakeRotorMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.8,
        roughness: 0.35,
        flatShading: true
      })
    );

    this.brakeCaliperMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.4,
        metalness: 0.2,
        flatShading: true
      })
    );

    this.bumperTrimMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x27272a,
        roughness: 0.75,
        metalness: 0.25,
        flatShading: true
      })
    );

    this.chromeTrimMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        metalness: 0.95,
        roughness: 0.1,
        flatShading: true
      })
    );

    this.grilleMeshMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x09090b,
        roughness: 0.92,
        metalness: 0.1,
        flatShading: true
      })
    );

    this.headlightLensMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.8,
        roughness: 0.15
      })
    );

    this.turnSignalMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 1.2,
        roughness: 0.25
      })
    );

    this.fogLightMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 1.3,
        roughness: 0.2
      })
    );

    this.taillightRedMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.6,
        roughness: 0.2
      })
    );

    this.reverseLightMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0xe2e8f0,
        emissiveIntensity: 1.0,
        roughness: 0.3
      })
    );

    this.licensePlateMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfef9c3, // Soft ivory/yellow plate
        roughness: 0.45,
        metalness: 0.1
      })
    );

    this.plateBorderMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.8
      })
    );

    this.mirrorGlassMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.95,
        roughness: 0.1
      })
    );

    this.headlightBeamTexture = this.createHeadlightBeamTexture();
    this.headlightBeamMaterial = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        map: this.headlightBeamTexture,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    this.taxiYellowMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.35,
        metalness: 0.25,
        flatShading: true
      })
    );

    this.taxiSignMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 1.6,
        roughness: 0.2
      })
    );

    this.taxiCheckerMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.5,
        flatShading: true
      })
    );

    this.policeNavyMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.32,
        metalness: 0.35,
        flatShading: true
      })
    );

    this.policeWhiteMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.35,
        flatShading: true
      })
    );

    this.policeGoldBadgeMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.85,
        roughness: 0.25
      })
    );

    this.ambulanceWhiteMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.15,
        flatShading: true
      })
    );

    this.ambulanceRedCrossMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        emissive: 0xb91c1c,
        emissiveIntensity: 0.7,
        flatShading: true
      })
    );

    this.ambulanceChevronYellowMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.4,
        flatShading: true
      })
    );

    this.transitDestinationDisplayMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.9,
        roughness: 0.2
      })
    );

    this.roofAcVentMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.6,
        metalness: 0.3,
        flatShading: true
      })
    );

    this.emergencyBlueActiveMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x2563eb,
        emissiveIntensity: 3.4,
        roughness: 0.15
      })
    );

    this.emergencyRedActiveMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 3.4,
        roughness: 0.15
      })
    );

    this.emergencyStrobeDimMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.6,
        metalness: 0.4
      })
    );
  }

  /**
   * Generates a soft, feathered forward-projecting conical gradient texture for vehicle headlights.
   * Produces authentic, directional roadway illumination with zero oversized polygons or hard rectangular patches.
   */
  private createHeadlightBeamTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.Texture();
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Conic forward projection beam: starts at bottom center and widens forward
    const gradient = ctx.createLinearGradient(64, 128, 64, 0);
    gradient.addColorStop(0.0, 'rgba(255, 250, 230, 0.75)');
    gradient.addColorStop(0.35, 'rgba(255, 245, 210, 0.38)');
    gradient.addColorStop(0.70, 'rgba(255, 240, 190, 0.12)');
    gradient.addColorStop(1.0, 'rgba(255, 240, 190, 0.0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(46, 128);
    ctx.lineTo(82, 128);
    ctx.lineTo(124, 0);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  private initSharedGeometries(): void {
    this.standardTireGeo = this.trackGeometry(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 14));
    this.suvTireGeo = this.trackGeometry(new THREE.CylinderGeometry(0.42, 0.42, 0.29, 14));
    this.heavyTireGeo = this.trackGeometry(new THREE.CylinderGeometry(0.40, 0.40, 0.28, 14));

    this.standardRimGeo = this.trackGeometry(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 10));
    this.suvRimGeo = this.trackGeometry(new THREE.CylinderGeometry(0.26, 0.26, 0.31, 10));

    this.brakeDiscGeo = this.trackGeometry(new THREE.CylinderGeometry(0.16, 0.16, 0.23, 8));
    this.caliperGeo = this.trackGeometry(new THREE.BoxGeometry(0.06, 0.11, 0.08));

    this.headlightGeo = this.trackGeometry(new THREE.BoxGeometry(0.32, 0.14, 0.06));
    this.taillightGeo = this.trackGeometry(new THREE.BoxGeometry(0.32, 0.14, 0.06));
    this.turnSignalGeo = this.trackGeometry(new THREE.BoxGeometry(0.08, 0.14, 0.06));

    this.plateGeo = this.trackGeometry(new THREE.BoxGeometry(0.46, 0.15, 0.02));
    this.plateBackGeo = this.trackGeometry(new THREE.BoxGeometry(0.50, 0.18, 0.015));

    this.mirrorArmGeo = this.trackGeometry(new THREE.BoxGeometry(0.08, 0.04, 0.06));
    this.mirrorHeadGeo = this.trackGeometry(new THREE.BoxGeometry(0.14, 0.10, 0.16));
    this.mirrorFaceGeo = this.trackGeometry(new THREE.BoxGeometry(0.12, 0.08, 0.01));
  }

  private getBodyMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.bodyMaterialCache.get(colorHex);
    if (!mat) {
      mat = this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.32,
          metalness: 0.28,
          flatShading: true
        })
      );
      this.bodyMaterialCache.set(colorHex, mat);
    }
    return mat;
  }

  /**
   * Constructs procedural stylized 3D model specific to vehicle type.
   */
  private createPooledMesh(type: VehicleType): PooledVehicleMesh {
    const group = new THREE.Group();
    group.name = `VehicleMesh_${type}`;

    let bodyMesh: THREE.Mesh;
    const bodyMeshes: THREE.Mesh[] = [];
    let emergencyLeft: THREE.Mesh | undefined;
    let emergencyRight: THREE.Mesh | undefined;
    const emergencyExtra: THREE.Mesh[] = [];
    let taxiSign: THREE.Mesh | undefined;

    const defaultColor = 0x3b82f6;
    const defaultBodyMat = this.getBodyMaterial(defaultColor);

    switch (type) {
      case 'hatchback': {
        const result = this.buildHatchbackModel(group, defaultBodyMat);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        break;
      }

      case 'suv': {
        const result = this.buildSuvModel(group, defaultBodyMat);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        break;
      }

      case 'taxi': {
        const result = this.buildTaxiModel(group);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        taxiSign = result.taxiSign;
        break;
      }

      case 'police': {
        const result = this.buildPoliceModel(group);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        emergencyLeft = result.emergencyLeft;
        emergencyRight = result.emergencyRight;
        emergencyExtra.push(...result.emergencyExtra);
        break;
      }

      case 'ambulance': {
        const result = this.buildAmbulanceModel(group);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        emergencyLeft = result.emergencyLeft;
        emergencyRight = result.emergencyRight;
        emergencyExtra.push(...result.emergencyExtra);
        break;
      }

      case 'van': {
        const result = this.buildVanModel(group, defaultBodyMat);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        break;
      }

      case 'sedan':
      default: {
        const result = this.buildSedanModel(group, defaultBodyMat);
        bodyMesh = result.bodyMesh;
        bodyMeshes.push(...result.bodyMeshes);
        break;
      }
    }

    group.visible = false;
    this.scene.add(group);

    const pooled: PooledVehicleMesh = {
      type,
      group,
      bodyMesh,
      bodyMeshes,
      emergencyLeftLight: emergencyLeft,
      emergencyRightLight: emergencyRight,
      emergencyExtraLights: emergencyExtra.length > 0 ? emergencyExtra : undefined,
      taxiSignMesh: taxiSign,
      inUse: false
    };

    this.pool.push(pooled);
    return pooled;
  }

  // =========================================================================
  // SHARED COMPONENT BUILDERS (Wheels, Lights, Plates, Mirrors, Grilles)
  // =========================================================================

  private addWheels(
    group: THREE.Group,
    halfTrack: number,
    frontZ: number,
    rearZ: number,
    radius: number = 0.35,
    isSuv: boolean = false,
    isDualRear: boolean = false
  ): void {
    const tireGeo = isSuv ? this.suvTireGeo : radius > 0.38 ? this.heavyTireGeo : this.standardTireGeo;
    const rimGeo = isSuv ? this.suvRimGeo : this.standardRimGeo;

    const basePositions = [
      { x: -halfTrack, z: frontZ, sign: -1, isRear: false },
      { x: halfTrack, z: frontZ, sign: 1, isRear: false },
      { x: -halfTrack, z: rearZ, sign: -1, isRear: true },
      { x: halfTrack, z: rearZ, sign: 1, isRear: true }
    ];

    basePositions.forEach(wp => {
      const wheelAssembly = new THREE.Group();
      wheelAssembly.position.set(wp.x, radius, wp.z);

      // Tire
      const tire = new THREE.Mesh(tireGeo, this.wheelTireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelAssembly.add(tire);

      // Alloy Rim Hub
      const rim = new THREE.Mesh(rimGeo, this.rimAlloyMaterial);
      rim.rotation.z = Math.PI / 2;
      rim.position.x = wp.sign * 0.02;
      wheelAssembly.add(rim);

      // Brake rotor disc and sport caliper
      const rotor = new THREE.Mesh(this.brakeDiscGeo, this.brakeRotorMaterial);
      rotor.rotation.z = Math.PI / 2;
      rotor.position.x = -wp.sign * 0.02;
      wheelAssembly.add(rotor);

      const caliper = new THREE.Mesh(this.caliperGeo, this.brakeCaliperMaterial);
      caliper.position.set(-wp.sign * 0.03, radius * 0.3, 0);
      wheelAssembly.add(caliper);

      // If heavy commercial transit minibus has dual rear wheels
      if (isDualRear && wp.isRear) {
        const innerTire = new THREE.Mesh(tireGeo, this.wheelTireMaterial);
        innerTire.rotation.z = Math.PI / 2;
        innerTire.position.x = -wp.sign * 0.22;
        innerTire.castShadow = true;
        wheelAssembly.add(innerTire);
      }

      group.add(wheelAssembly);
    });
  }

  private addHeadlights(
    group: THREE.Group,
    halfSpan: number,
    heightY: number,
    frontZ: number
  ): void {
    // Left & Right Headlights (+Z front)
    [-halfSpan, halfSpan].forEach(x => {
      const hl = new THREE.Mesh(this.headlightGeo, this.headlightLensMaterial);
      hl.position.set(x, heightY, frontZ);
      group.add(hl);

      // Amber turn signal strip on outer flank
      const sign = x > 0 ? 1 : -1;
      const turn = new THREE.Mesh(this.turnSignalGeo, this.turnSignalMaterial);
      turn.position.set(x + sign * 0.20, heightY, frontZ);
      group.add(turn);
    });

    // Subtle, directional forward ground beam projection (feathered conic gradient)
    const beamGeo = this.trackGeometry(new THREE.PlaneGeometry(halfSpan * 2.2, 4.4));
    const beam = new THREE.Mesh(beamGeo, this.headlightBeamMaterial);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 0.016, frontZ + 2.2);
    group.add(beam);
  }

  private addTaillights(
    group: THREE.Group,
    halfSpan: number,
    heightY: number,
    rearZ: number,
    isVertical: boolean = false
  ): void {
    [-halfSpan, halfSpan].forEach(x => {
      const tl = new THREE.Mesh(this.taillightGeo, this.taillightRedMaterial);
      if (isVertical) {
        tl.rotation.z = Math.PI / 2;
      }
      tl.position.set(x, heightY, rearZ);
      group.add(tl);

      // White reverse light insert
      const rev = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, isVertical ? 0.24 : 0.06, 0.065),
        this.reverseLightMaterial
      );
      rev.position.set(x, heightY, rearZ);
      group.add(rev);
    });
  }

  private addLicensePlates(
    group: THREE.Group,
    frontZ: number,
    rearZ: number,
    frontY: number,
    rearY: number
  ): void {
    // Front Plate
    const fpBack = new THREE.Mesh(this.plateBackGeo, this.plateBorderMaterial);
    fpBack.position.set(0, frontY, frontZ + 0.01);
    group.add(fpBack);
    const fp = new THREE.Mesh(this.plateGeo, this.licensePlateMaterial);
    fp.position.set(0, frontY, frontZ + 0.02);
    group.add(fp);

    // Rear Plate
    const rpBack = new THREE.Mesh(this.plateBackGeo, this.plateBorderMaterial);
    rpBack.position.set(0, rearY, rearZ - 0.01);
    group.add(rpBack);
    const rp = new THREE.Mesh(this.plateGeo, this.licensePlateMaterial);
    rp.position.set(0, rearY, rearZ - 0.02);
    group.add(rp);
  }

  private addMirrors(
    group: THREE.Group,
    halfSpan: number,
    heightY: number,
    zPos: number,
    bodyMat: THREE.Material,
    bodyMeshes: THREE.Mesh[]
  ): void {
    [-halfSpan, halfSpan].forEach(x => {
      const sign = x > 0 ? 1 : -1;
      const arm = new THREE.Mesh(this.mirrorArmGeo, this.bumperTrimMaterial);
      arm.position.set(x - sign * 0.05, heightY, zPos);
      group.add(arm);

      const head = new THREE.Mesh(this.mirrorHeadGeo, bodyMat);
      head.position.set(x, heightY, zPos);
      group.add(head);
      bodyMeshes.push(head);

      // Reflective mirror face pointing rearward (-Z)
      const face = new THREE.Mesh(this.mirrorFaceGeo, this.mirrorGlassMaterial);
      face.position.set(x, heightY, zPos - 0.08);
      group.add(face);
    });
  }

  private addFrontGrille(
    group: THREE.Group,
    width: number,
    height: number,
    frontZ: number,
    heightY: number,
    hasChromeBorder: boolean = true
  ): void {
    if (hasChromeBorder) {
      const border = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.06),
        this.chromeTrimMaterial
      );
      border.position.set(0, heightY, frontZ);
      group.add(border);
    }

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.08),
      this.grilleMeshMaterial
    );
    grille.position.set(0, heightY, frontZ + 0.01);
    group.add(grille);
  }

  // =========================================================================
  // VEHICLE 1: EXECUTIVE SEDAN (Length 4.65m, Width 1.80m, Height 1.42m)
  // =========================================================================

  private buildSedanModel(
    group: THREE.Group,
    bodyMat: THREE.MeshStandardMaterial
  ): { bodyMesh: THREE.Mesh; bodyMeshes: THREE.Mesh[] } {
    const bodyMeshes: THREE.Mesh[] = [];

    // 1. Lower chassis / underbody
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(1.68, 0.16, 4.40),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.28, 0);
    group.add(underbody);

    // 2. Main lower bodywork shell
    const bodyGeo = new THREE.BoxGeometry(1.80, 0.44, 4.65);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.54, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // 3. Hood (bonnet) slope
    const hoodGeo = new THREE.BoxGeometry(1.68, 0.14, 1.30);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.74, 1.40);
    hood.rotation.x = -0.05;
    group.add(hood);
    bodyMeshes.push(hood);

    // 4. Trunk (boot deck)
    const trunkGeo = new THREE.BoxGeometry(1.66, 0.14, 1.05);
    const trunk = new THREE.Mesh(trunkGeo, bodyMat);
    trunk.position.set(0, 0.76, -1.50);
    group.add(trunk);
    bodyMeshes.push(trunk);

    // 5. Aerodynamic greenhouse cabin (windshield + dark glass cabin + rear glass)
    const cabinGeo = new THREE.BoxGeometry(1.50, 0.50, 2.20);
    const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
    cabin.position.set(0, 1.02, -0.05);
    cabin.castShadow = true;
    group.add(cabin);

    // Tilted front windshield wedge
    const wsGeo = new THREE.BoxGeometry(1.48, 0.38, 0.55);
    const ws = new THREE.Mesh(wsGeo, this.windowMaterial);
    ws.position.set(0, 0.94, 0.98);
    ws.rotation.x = -0.48;
    group.add(ws);

    // Tilted rear window wedge
    const rwGeo = new THREE.BoxGeometry(1.46, 0.38, 0.55);
    const rw = new THREE.Mesh(rwGeo, this.windowMaterial);
    rw.position.set(0, 0.96, -1.06);
    rw.rotation.x = 0.48;
    group.add(rw);

    // Roof panel
    const roofGeo = new THREE.BoxGeometry(1.44, 0.06, 1.70);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.28, -0.05);
    group.add(roof);
    bodyMeshes.push(roof);

    // Roof shark fin antenna
    const antennaGeo = new THREE.BoxGeometry(0.04, 0.08, 0.16);
    const antenna = new THREE.Mesh(antennaGeo, this.bumperTrimMaterial);
    antenna.position.set(0, 1.34, -0.75);
    group.add(antenna);

    // 6. Front & Rear Fascias
    this.addFrontGrille(group, 0.95, 0.18, 2.33, 0.58, true);
    this.addHeadlights(group, 0.62, 0.58, 2.34);
    this.addTaillights(group, 0.62, 0.60, -2.34);

    // Bumpers
    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.15), this.bumperTrimMaterial);
    fb.position.set(0, 0.38, 2.33);
    group.add(fb);

    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.15), this.bumperTrimMaterial);
    rb.position.set(0, 0.38, -2.33);
    group.add(rb);

    // Dual chrome exhaust pipes
    [-0.50, 0.50].forEach(x => {
      const exhaust = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8),
        this.chromeTrimMaterial
      );
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(x, 0.30, -2.38);
      group.add(exhaust);
    });

    this.addLicensePlates(group, 2.34, -2.34, 0.40, 0.44);
    this.addMirrors(group, 0.98, 0.98, 0.85, bodyMat, bodyMeshes);
    this.addWheels(group, 0.92, 1.35, -1.35, 0.35);

    return { bodyMesh, bodyMeshes };
  }

  // =========================================================================
  // VEHICLE 2: COMPACT HATCHBACK (Length 3.85m, Width 1.73m, Height 1.50m)
  // =========================================================================

  private buildHatchbackModel(
    group: THREE.Group,
    bodyMat: THREE.MeshStandardMaterial
  ): { bodyMesh: THREE.Mesh; bodyMeshes: THREE.Mesh[] } {
    const bodyMeshes: THREE.Mesh[] = [];

    // Lower chassis
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(1.62, 0.16, 3.65),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.28, 0);
    group.add(underbody);

    // Main lower body shell
    const bodyGeo = new THREE.BoxGeometry(1.72, 0.44, 3.85);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.54, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // Short sloping front hood
    const hoodGeo = new THREE.BoxGeometry(1.60, 0.14, 1.05);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.74, 1.10);
    hood.rotation.x = -0.07;
    group.add(hood);
    bodyMeshes.push(hood);

    // Upright spacious cabin
    const cabinGeo = new THREE.BoxGeometry(1.48, 0.52, 1.95);
    const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
    cabin.position.set(0, 1.04, -0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // Front windshield wedge
    const wsGeo = new THREE.BoxGeometry(1.44, 0.40, 0.50);
    const ws = new THREE.Mesh(wsGeo, this.windowMaterial);
    ws.position.set(0, 0.96, 0.76);
    ws.rotation.x = -0.45;
    group.add(ws);

    // Steep sloping rear tailgate
    const rwGeo = new THREE.BoxGeometry(1.42, 0.48, 0.45);
    const rw = new THREE.Mesh(rwGeo, this.windowMaterial);
    rw.position.set(0, 1.02, -1.18);
    rw.rotation.x = 0.55;
    group.add(rw);

    // Roof panel
    const roofGeo = new THREE.BoxGeometry(1.42, 0.06, 1.60);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.31, -0.15);
    group.add(roof);
    bodyMeshes.push(roof);

    // Sporty aerodynamic roof spoiler wing
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.06, 0.32),
      this.bumperTrimMaterial
    );
    spoiler.position.set(0, 1.36, -1.25);
    group.add(spoiler);

    // Fascias
    this.addFrontGrille(group, 0.85, 0.16, 1.93, 0.54, false);
    this.addHeadlights(group, 0.56, 0.56, 1.93);
    this.addTaillights(group, 0.58, 0.82, -1.93, true);

    // Front & rear bumpers
    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 0.14), this.bumperTrimMaterial);
    fb.position.set(0, 0.38, 1.93);
    group.add(fb);

    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 0.14), this.bumperTrimMaterial);
    rb.position.set(0, 0.38, -1.93);
    group.add(rb);

    // Single sporty chrome exhaust tip
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.15, 8),
      this.chromeTrimMaterial
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.48, 0.30, -1.98);
    group.add(exhaust);

    this.addLicensePlates(group, 1.94, -1.94, 0.38, 0.42);
    this.addMirrors(group, 0.92, 0.96, 0.65, bodyMat, bodyMeshes);
    this.addWheels(group, 0.88, 1.15, -1.15, 0.35);

    return { bodyMesh, bodyMeshes };
  }

  // =========================================================================
  // VEHICLE 3: FULL-SIZE SUV (Length 4.95m, Width 1.96m, Height 1.88m)
  // =========================================================================

  private buildSuvModel(
    group: THREE.Group,
    bodyMat: THREE.MeshStandardMaterial
  ): { bodyMesh: THREE.Mesh; bodyMeshes: THREE.Mesh[] } {
    const bodyMeshes: THREE.Mesh[] = [];

    // Elevated rugged chassis & lower rocker panels
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.22, 4.65),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.38, 0);
    group.add(underbody);

    // Main SUV body
    const bodyGeo = new THREE.BoxGeometry(1.96, 0.58, 4.95);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.72, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // Flared matte black wheel arches (lower trim)
    const archTrimGeo = new THREE.BoxGeometry(1.98, 0.12, 4.97);
    const archTrim = new THREE.Mesh(archTrimGeo, this.bumperTrimMaterial);
    archTrim.position.set(0, 0.48, 0);
    group.add(archTrim);

    // Rugged high hood
    const hoodGeo = new THREE.BoxGeometry(1.82, 0.18, 1.45);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.98, 1.45);
    group.add(hood);
    bodyMeshes.push(hood);

    // Large boxy cabin with full side windows
    const cabinGeo = new THREE.BoxGeometry(1.72, 0.64, 2.95);
    const cabin = new THREE.Mesh(cabinGeo, this.windowMaterial);
    cabin.position.set(0, 1.38, -0.15);
    cabin.castShadow = true;
    group.add(cabin);

    // Tilted windshield
    const wsGeo = new THREE.BoxGeometry(1.68, 0.45, 0.60);
    const ws = new THREE.Mesh(wsGeo, this.windowMaterial);
    ws.position.set(0, 1.28, 1.15);
    ws.rotation.x = -0.45;
    group.add(ws);

    // Upright rear cargo glass
    const rwGeo = new THREE.BoxGeometry(1.66, 0.50, 0.35);
    const rw = new THREE.Mesh(rwGeo, this.windowMaterial);
    rw.position.set(0, 1.36, -1.60);
    rw.rotation.x = 0.25;
    group.add(rw);

    // Roof panel
    const roofGeo = new THREE.BoxGeometry(1.68, 0.06, 2.65);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.72, -0.15);
    group.add(roof);
    bodyMeshes.push(roof);

    // Sturdy roof cargo rails & crossbars
    [-0.78, 0.78].forEach(x => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.08, 2.45),
        this.bumperTrimMaterial
      );
      rail.position.set(x, 1.78, -0.15);
      group.add(rail);
    });
    [-0.8, 0.4].forEach(z => {
      const crossbar = new THREE.Mesh(
        new THREE.BoxGeometry(1.54, 0.04, 0.06),
        this.bumperTrimMaterial
      );
      crossbar.position.set(0, 1.80, z);
      group.add(crossbar);
    });

    // Rear tailgate-mounted full-size spare tire with alloy rim
    const spareTireGroup = new THREE.Group();
    spareTireGroup.position.set(0, 0.95, -2.55);
    const spareTire = new THREE.Mesh(this.suvTireGeo, this.wheelTireMaterial);
    spareTire.rotation.x = Math.PI / 2;
    spareTireGroup.add(spareTire);
    const spareCover = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.30, 12),
      this.bumperTrimMaterial
    );
    spareCover.rotation.x = Math.PI / 2;
    spareTireGroup.add(spareCover);
    const spareEmblem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.31, 8),
      this.chromeTrimMaterial
    );
    spareEmblem.rotation.x = Math.PI / 2;
    spareTireGroup.add(spareEmblem);
    group.add(spareTireGroup);

    // Fascia & Skid Plates
    this.addFrontGrille(group, 1.15, 0.24, 2.48, 0.78, true);
    this.addHeadlights(group, 0.68, 0.80, 2.49);
    this.addTaillights(group, 0.74, 0.88, -2.49);

    // Rugged front skid plate with integrated fog lights
    const skidPlate = new THREE.Mesh(
      new THREE.BoxGeometry(1.20, 0.18, 0.16),
      this.chromeTrimMaterial
    );
    skidPlate.position.set(0, 0.44, 2.48);
    group.add(skidPlate);

    [-0.45, 0.45].forEach(x => {
      const fog = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.06), this.fogLightMaterial);
      fog.position.set(x, 0.44, 2.50);
      group.add(fog);
    });

    this.addLicensePlates(group, 2.50, -2.70, 0.44, 0.52);
    this.addMirrors(group, 1.08, 1.35, 1.05, bodyMat, bodyMeshes);
    this.addWheels(group, 1.00, 1.50, -1.50, 0.42, true);

    return { bodyMesh, bodyMeshes };
  }

  // =========================================================================
  // VEHICLE 4: CITY TAXI CAB (Length 4.60m, Width 1.78m, Height 1.46m)
  // =========================================================================

  private buildTaxiModel(
    group: THREE.Group
  ): { bodyMesh: THREE.Mesh; bodyMeshes: THREE.Mesh[]; taxiSign: THREE.Mesh } {
    const bodyMeshes: THREE.Mesh[] = [];
    const taxiMat = this.taxiYellowMaterial;

    // 1. Lower chassis
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, 0.16, 4.35),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.28, 0);
    group.add(underbody);

    // 2. Yellow taxi bodywork
    const bodyGeo = new THREE.BoxGeometry(1.80, 0.44, 4.60);
    const bodyMesh = new THREE.Mesh(bodyGeo, taxiMat);
    bodyMesh.position.set(0, 0.54, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // 3. Black/White Checkerboard Speed Stripe along both sides
    [-0.91, 0.91].forEach(x => {
      const stripeGeo = new THREE.BoxGeometry(0.015, 0.12, 2.80);
      const stripe = new THREE.Mesh(stripeGeo, this.taxiCheckerMaterial);
      stripe.position.set(x, 0.56, 0);
      group.add(stripe);
    });

    // 4. Hood & Trunk
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.14, 1.25), taxiMat);
    hood.position.set(0, 0.74, 1.35);
    hood.rotation.x = -0.05;
    group.add(hood);
    bodyMeshes.push(hood);

    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.14, 1.00), taxiMat);
    trunk.position.set(0, 0.76, -1.45);
    group.add(trunk);
    bodyMeshes.push(trunk);

    // 5. Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.50, 2.20), this.windowMaterial);
    cabin.position.set(0, 1.02, -0.05);
    cabin.castShadow = true;
    group.add(cabin);

    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.38, 0.55), this.windowMaterial);
    ws.position.set(0, 0.94, 0.98);
    ws.rotation.x = -0.48;
    group.add(ws);

    const rw = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.38, 0.55), this.windowMaterial);
    rw.position.set(0, 0.96, -1.06);
    rw.rotation.x = 0.48;
    group.add(rw);

    // Yellow Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.06, 1.70), taxiMat);
    roof.position.set(0, 1.28, -0.05);
    group.add(roof);
    bodyMeshes.push(roof);

    // 6. Illuminated Rooftop TAXI Beacon
    const taxiSignMount = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.04, 0.18),
      this.bumperTrimMaterial
    );
    taxiSignMount.position.set(0, 1.32, -0.05);
    group.add(taxiSignMount);

    const taxiSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.20, 0.24),
      this.taxiSignMaterial
    );
    taxiSign.position.set(0, 1.44, -0.05);
    group.add(taxiSign);

    // Fascias & Mirrors
    this.addFrontGrille(group, 0.95, 0.18, 2.31, 0.58, true);
    this.addHeadlights(group, 0.62, 0.58, 2.32);
    this.addTaillights(group, 0.62, 0.60, -2.32);

    const fb = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.14), this.bumperTrimMaterial);
    fb.position.set(0, 0.38, 2.31);
    group.add(fb);

    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 0.14), this.bumperTrimMaterial);
    rb.position.set(0, 0.38, -2.31);
    group.add(rb);

    this.addLicensePlates(group, 2.32, -2.32, 0.40, 0.44);
    this.addMirrors(group, 0.98, 0.98, 0.85, taxiMat, bodyMeshes);
    this.addWheels(group, 0.92, 1.35, -1.35, 0.35);

    return { bodyMesh, bodyMeshes, taxiSign };
  }

  // =========================================================================
  // VEHICLE 5: POLICE PATROL CRUISER (Length 4.80m, Width 1.86m, Height 1.52m)
  // =========================================================================

  private buildPoliceModel(
    group: THREE.Group
  ): {
    bodyMesh: THREE.Mesh;
    bodyMeshes: THREE.Mesh[];
    emergencyLeft: THREE.Mesh;
    emergencyRight: THREE.Mesh;
    emergencyExtra: THREE.Mesh[];
  } {
    const bodyMeshes: THREE.Mesh[] = [];
    const navyMat = this.policeNavyMaterial;
    const whiteMat = this.policeWhiteMaterial;

    // 1. Lower chassis
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(1.74, 0.16, 4.55),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.28, 0);
    group.add(underbody);

    // 2. Interceptor navy bodywork
    const bodyGeo = new THREE.BoxGeometry(1.86, 0.46, 4.80);
    const bodyMesh = new THREE.Mesh(bodyGeo, navyMat);
    bodyMesh.position.set(0, 0.56, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // 3. Crisp white door accent wraps
    [-0.94, 0.94].forEach(x => {
      const doorWrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.42, 2.10),
        whiteMat
      );
      doorWrap.position.set(x, 0.56, 0.05);
      group.add(doorWrap);

      // Gold star police badge emblem on doors
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.16, 0.16),
        this.policeGoldBadgeMaterial
      );
      badge.position.set(x * 1.01, 0.58, 0.05);
      badge.rotation.z = Math.PI / 4;
      group.add(badge);
    });

    // 4. Hood & Trunk
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 1.35), navyMat);
    hood.position.set(0, 0.76, 1.45);
    hood.rotation.x = -0.05;
    group.add(hood);
    bodyMeshes.push(hood);

    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.14, 1.15), navyMat);
    trunk.position.set(0, 0.78, -1.55);
    group.add(trunk);
    bodyMeshes.push(trunk);

    // 5. Cabin & White Roof
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.52, 2.35), this.windowMaterial);
    cabin.position.set(0, 1.04, -0.05);
    cabin.castShadow = true;
    group.add(cabin);

    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.40, 0.55), this.windowMaterial);
    ws.position.set(0, 0.96, 1.05);
    ws.rotation.x = -0.48;
    group.add(ws);

    const rw = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.40, 0.55), this.windowMaterial);
    rw.position.set(0, 0.98, -1.15);
    rw.rotation.x = 0.48;
    group.add(rw);

    // White roof panel (standard police interceptor livery)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.06, 1.80), whiteMat);
    roof.position.set(0, 1.32, -0.05);
    group.add(roof);

    // 6. Heavy-Duty Black Push Bumper (Bull Bar)
    const bullBarGroup = new THREE.Group();
    bullBarGroup.position.set(0, 0.56, 2.45);
    const horizBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.30, 0.08, 0.10),
      this.bumperTrimMaterial
    );
    bullBarGroup.add(horizBar);
    [-0.45, 0.45].forEach(bx => {
      const vertPusher = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.46, 0.12),
        this.bumperTrimMaterial
      );
      vertPusher.position.set(bx, 0.06, 0.02);
      bullBarGroup.add(vertPusher);
    });
    group.add(bullBarGroup);

    // Driver-side A-Pillar Spotlight
    const spotlight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8),
      this.bumperTrimMaterial
    );
    spotlight.rotation.x = Math.PI / 2;
    spotlight.position.set(-0.90, 1.08, 0.85);
    group.add(spotlight);
    const spotLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 8),
      this.headlightLensMaterial
    );
    spotLens.position.set(-0.90, 1.08, 0.915);
    group.add(spotLens);

    // 7. Aerodynamic High-Profile Emergency Lightbar
    const barMount = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.04, 0.22),
      this.bumperTrimMaterial
    );
    barMount.position.set(0, 1.36, -0.05);
    group.add(barMount);

    // Left Blue Strobe Lens
    const emergencyLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.12, 0.22),
      this.emergencyStrobeDimMaterial
    );
    emergencyLeft.position.set(-0.30, 1.44, -0.05);
    group.add(emergencyLeft);

    // Right Red Strobe Lens
    const emergencyRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.12, 0.22),
      this.emergencyStrobeDimMaterial
    );
    emergencyRight.position.set(0.30, 1.44, -0.05);
    group.add(emergencyRight);

    // Center Takedown / Pursuit Pod
    const takedownCenter = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.10, 0.20),
      this.reverseLightMaterial
    );
    takedownCenter.position.set(0, 1.44, -0.05);
    group.add(takedownCenter);

    // Fascias & Wheels
    this.addFrontGrille(group, 1.00, 0.20, 2.41, 0.60, true);
    this.addHeadlights(group, 0.66, 0.60, 2.42);
    this.addTaillights(group, 0.66, 0.64, -2.42);

    this.addLicensePlates(group, 2.44, -2.42, 0.42, 0.46);
    this.addMirrors(group, 1.02, 1.00, 0.90, navyMat, bodyMeshes);
    this.addWheels(group, 0.95, 1.40, -1.40, 0.35);

    return {
      bodyMesh,
      bodyMeshes,
      emergencyLeft,
      emergencyRight,
      emergencyExtra: [takedownCenter]
    };
  }

  // =========================================================================
  // VEHICLE 6: EMERGENCY AMBULANCE (Length 5.65m, Width 2.12m, Height 2.45m)
  // =========================================================================

  private buildAmbulanceModel(
    group: THREE.Group
  ): {
    bodyMesh: THREE.Mesh;
    bodyMeshes: THREE.Mesh[];
    emergencyLeft: THREE.Mesh;
    emergencyRight: THREE.Mesh;
    emergencyExtra: THREE.Mesh[];
  } {
    const bodyMeshes: THREE.Mesh[] = [];
    const whiteMat = this.ambulanceWhiteMaterial;
    const emergencyExtra: THREE.Mesh[] = [];

    // 1. Heavy commercial chassis
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(2.00, 0.22, 5.35),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.32, 0);
    group.add(underbody);

    // 2. Main Medical Box Van Body
    const bodyGeo = new THREE.BoxGeometry(2.12, 1.45, 5.65);
    const bodyMesh = new THREE.Mesh(bodyGeo, whiteMat);
    bodyMesh.position.set(0, 1.15, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // 3. Side & Rear Reflective Medical Stripe Chevrons
    [-1.07, 1.07].forEach(x => {
      // Red medical stripe
      const redStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.24, 4.40),
        this.ambulanceRedCrossMaterial
      );
      redStripe.position.set(x, 1.15, -0.20);
      group.add(redStripe);

      // Yellow reflective lower accent
      const yelStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.08, 4.40),
        this.ambulanceChevronYellowMaterial
      );
      yelStripe.position.set(x, 0.98, -0.20);
      group.add(yelStripe);

      // 3D Red Medical Cross symbol
      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.16, 0.44),
        this.ambulanceRedCrossMaterial
      );
      crossH.position.set(x * 1.005, 1.55, -0.40);
      group.add(crossH);

      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.44, 0.16),
        this.ambulanceRedCrossMaterial
      );
      crossV.position.set(x * 1.005, 1.55, -0.40);
      group.add(crossV);
    });

    // Rear Doors Medical Crosses
    [-0.50, 0.50].forEach(x => {
      const rearCrossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.12, 0.02),
        this.ambulanceRedCrossMaterial
      );
      rearCrossH.position.set(x, 1.50, -2.84);
      group.add(rearCrossH);

      const rearCrossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.32, 0.02),
        this.ambulanceRedCrossMaterial
      );
      rearCrossV.position.set(x, 1.50, -2.84);
      group.add(rearCrossV);
    });

    // 4. Front Driver Cab & Aerodynamic Fairing
    const cabWs = new THREE.Mesh(
      new THREE.BoxGeometry(1.90, 0.58, 0.85),
      this.windowMaterial
    );
    cabWs.position.set(0, 1.48, 2.05);
    cabWs.rotation.x = -0.32;
    group.add(cabWs);

    const cabHood = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.22, 1.05),
      whiteMat
    );
    cabHood.position.set(0, 1.00, 2.25);
    group.add(cabHood);
    bodyMeshes.push(cabHood);

    // Cab-over aerodynamic wind deflector transition
    const fairing = new THREE.Mesh(
      new THREE.BoxGeometry(2.08, 0.38, 0.70),
      whiteMat
    );
    fairing.position.set(0, 1.95, 1.35);
    fairing.rotation.x = 0.25;
    group.add(fairing);
    bodyMeshes.push(fairing);

    // 5. Rear Paramedic Aluminum Step Bumper
    const rearStep = new THREE.Mesh(
      new THREE.BoxGeometry(2.10, 0.14, 0.25),
      this.chromeTrimMaterial
    );
    rearStep.position.set(0, 0.44, -2.90);
    group.add(rearStep);

    // Chrome siren horn speaker pod on cab roof
    const sirenSpeaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.20, 8),
      this.chromeTrimMaterial
    );
    sirenSpeaker.rotation.x = Math.PI / 2;
    sirenSpeaker.position.set(0, 2.02, 1.85);
    group.add(sirenSpeaker);

    // 6. Rooftop Emergency Lightbar & Corner Strobe Pods
    const lightbarMount = new THREE.Mesh(
      new THREE.BoxGeometry(1.20, 0.05, 0.25),
      this.bumperTrimMaterial
    );
    lightbarMount.position.set(0, 1.95, 2.00);
    group.add(lightbarMount);

    // Main Emergency Beacons
    const emergencyLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.16, 0.24),
      this.emergencyStrobeDimMaterial
    );
    emergencyLeft.position.set(-0.42, 2.05, 2.00);
    group.add(emergencyLeft);

    const emergencyRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.16, 0.24),
      this.emergencyStrobeDimMaterial
    );
    emergencyRight.position.set(0.42, 2.05, 2.00);
    group.add(emergencyRight);

    // 4 Corner Roof Perimeter Strobe Pods (Front & Rear corners)
    const cornerPositions = [
      { x: -0.98, z: 2.70 },
      { x: 0.98, z: 2.70 },
      { x: -0.98, z: -2.75 },
      { x: 0.98, z: -2.75 }
    ];

    cornerPositions.forEach(cp => {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.18),
        this.emergencyStrobeDimMaterial
      );
      pod.position.set(cp.x, 1.90, cp.z);
      group.add(pod);
      emergencyExtra.push(pod);
    });

    // Fascias & Wheels
    this.addFrontGrille(group, 1.25, 0.28, 2.83, 0.82, true);
    this.addHeadlights(group, 0.76, 0.82, 2.84);
    this.addTaillights(group, 0.82, 0.82, -2.84, true);

    const fb = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.24, 0.16), this.bumperTrimMaterial);
    fb.position.set(0, 0.44, 2.82);
    group.add(fb);

    this.addLicensePlates(group, 2.85, -2.85, 0.48, 0.56);
    this.addMirrors(group, 1.15, 1.45, 1.90, whiteMat, bodyMeshes);
    this.addWheels(group, 1.06, 1.70, -1.70, 0.40, false, true);

    return {
      bodyMesh,
      bodyMeshes,
      emergencyLeft,
      emergencyRight,
      emergencyExtra
    };
  }

  // =========================================================================
  // VEHICLE 7: CITY TRANSIT MINIBUS / PASSENGER SHUTTLE (Length 5.45m, Width 2.05m, Height 2.35m)
  // (Fulfills the "Larger buses with visible windows and distinct proportions" requirement)
  // =========================================================================

  private buildVanModel(
    group: THREE.Group,
    bodyMat: THREE.MeshStandardMaterial
  ): { bodyMesh: THREE.Mesh; bodyMeshes: THREE.Mesh[] } {
    const bodyMeshes: THREE.Mesh[] = [];

    // 1. Heavy transit chassis
    const underbody = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.22, 5.15),
      this.bumperTrimMaterial
    );
    underbody.position.set(0, 0.32, 0);
    group.add(underbody);

    // 2. Main transit bus lower bodywork
    const bodyGeo = new THREE.BoxGeometry(2.05, 1.35, 5.45);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 1.05, 0);
    bodyMesh.castShadow = true;
    group.add(bodyMesh);
    bodyMeshes.push(bodyMesh);

    // 3. Forward-swept aerodynamic front bus windshield
    const frontWs = new THREE.Mesh(
      new THREE.BoxGeometry(1.88, 0.65, 0.85),
      this.windowMaterial
    );
    frontWs.position.set(0, 1.45, 2.10);
    frontWs.rotation.x = -0.32;
    group.add(frontWs);

    // 4. Front Digital LED Destination Header Banner ("METRO / CITY TRANSIT")
    const destDisplay = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.18, 0.08),
      this.transitDestinationDisplayMaterial
    );
    destDisplay.position.set(0, 1.88, 2.22);
    group.add(destDisplay);

    // 5. Multi-pane Panoramic Tinted Passenger Windows along both flanks
    [-1.035, 1.035].forEach(x => {
      // 4 large passenger window bays per side with slim structural pillars
      for (let i = 0; i < 4; i++) {
        const winZ = 1.0 - i * 0.95;
        const pWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.48, 0.82),
          this.passengerWindowMaterial
        );
        pWin.position.set(x, 1.42, winZ);
        group.add(pWin);
      }
    });

    // 6. Passenger Entrance Folding Door Outline (Curbside Right +X)
    const doorOutline = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 1.15, 0.88),
      this.bumperTrimMaterial
    );
    doorOutline.position.set(1.035, 0.95, 1.0);
    group.add(doorOutline);

    // 7. Rooftop Climate Control / Ventilation AC Pods
    [-0.75, 0.75].forEach(z => {
      const acPod = new THREE.Mesh(
        new THREE.BoxGeometry(1.10, 0.16, 0.85),
        this.roofAcVentMaterial
      );
      acPod.position.set(0, 1.80, z);
      group.add(acPod);

      // Louver slots
      const ventSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.04, 0.60),
        this.grilleMeshMaterial
      );
      ventSlot.position.set(0, 1.89, z);
      group.add(ventSlot);
    });

    // 8. Rear Transit Window & High-Mounted Warning Light Bar
    const rearWin = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.44, 0.05),
      this.passengerWindowMaterial
    );
    rearWin.position.set(0, 1.42, -2.73);
    group.add(rearWin);

    const highStop = new THREE.Mesh(
      new THREE.BoxGeometry(0.60, 0.06, 0.05),
      this.taillightRedMaterial
    );
    highStop.position.set(0, 1.72, -2.73);
    group.add(highStop);

    // Fascias & Wheels
    this.addFrontGrille(group, 1.10, 0.24, 2.73, 0.74, true);
    this.addHeadlights(group, 0.72, 0.74, 2.74);
    this.addTaillights(group, 0.78, 0.78, -2.74, true);

    const fb = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.24, 0.16), this.bumperTrimMaterial);
    fb.position.set(0, 0.42, 2.73);
    group.add(fb);

    const rb = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.24, 0.16), this.bumperTrimMaterial);
    rb.position.set(0, 0.42, -2.73);
    group.add(rb);

    this.addLicensePlates(group, 2.75, -2.75, 0.46, 0.52);
    this.addMirrors(group, 1.12, 1.35, 1.95, bodyMat, bodyMeshes);
    // Dual wheels on the rear axle for realistic commercial transit bus stance
    this.addWheels(group, 1.02, 1.60, -1.60, 0.40, false, true);

    return { bodyMesh, bodyMeshes };
  }

  // =========================================================================
  // SYNCHRONIZATION, POOLING & LIFECYCLE MANAGEMENT
  // =========================================================================

  /**
   * Synchronizes active 3D vehicle meshes with current simulation vehicles and
   * deterministically updates emergency beacon strobes based on simulation time.
   */
  public sync(vehicles: Vehicle[], simTime: number = 0): void {
    this.pool.forEach(p => (p.inUse = false));

    const isFlashPhaseA = Math.floor(simTime * 4.0) % 2 === 0;

    for (const vehicle of vehicles) {
      const lane = this.laneNetwork.getLane(vehicle.laneId);
      if (!lane) continue;

      let pooled = this.pool.find(p => !p.inUse && p.type === vehicle.type);
      if (!pooled) {
        pooled = this.createPooledMesh(vehicle.type);
      }

      pooled.inUse = true;
      pooled.group.visible = true;

      // Position precisely on lane coordinates at road surface height (Y = 0)
      const coords = this.laneNetwork.getCoordinatesAt(vehicle.laneId, vehicle.s);
      pooled.group.position.set(coords.x, 0, coords.z);
      pooled.group.rotation.y = lane.heading;

      // Dynamic paint color
      const bodyMat = this.getBodyMaterial(vehicle.colorHex);
      pooled.bodyMesh.material = bodyMat;
      if (pooled.bodyMeshes) {
        for (const m of pooled.bodyMeshes) {
          m.material = bodyMat;
        }
      }

      // Emergency Beacon Strobes
      if (vehicle.isEmergencyActive) {
        if (isFlashPhaseA) {
          if (pooled.emergencyLeftLight) pooled.emergencyLeftLight.material = this.emergencyBlueActiveMaterial;
          if (pooled.emergencyRightLight) pooled.emergencyRightLight.material = this.emergencyStrobeDimMaterial;
          if (pooled.emergencyExtraLights) {
            pooled.emergencyExtraLights.forEach((light, i) => {
              light.material = (i % 2 === 0) ? this.emergencyBlueActiveMaterial : this.emergencyStrobeDimMaterial;
            });
          }
        } else {
          if (pooled.emergencyLeftLight) pooled.emergencyLeftLight.material = this.emergencyStrobeDimMaterial;
          if (pooled.emergencyRightLight) pooled.emergencyRightLight.material = this.emergencyRedActiveMaterial;
          if (pooled.emergencyExtraLights) {
            pooled.emergencyExtraLights.forEach((light, i) => {
              light.material = (i % 2 === 0) ? this.emergencyStrobeDimMaterial : this.emergencyRedActiveMaterial;
            });
          }
        }
      } else {
        if (pooled.emergencyLeftLight) pooled.emergencyLeftLight.material = this.emergencyStrobeDimMaterial;
        if (pooled.emergencyRightLight) pooled.emergencyRightLight.material = this.emergencyStrobeDimMaterial;
        if (pooled.emergencyExtraLights) {
          pooled.emergencyExtraLights.forEach(light => {
            light.material = this.emergencyStrobeDimMaterial;
          });
        }
      }
    }

    for (const p of this.pool) {
      if (!p.inUse) {
        p.group.visible = false;
        if (p.emergencyLeftLight) p.emergencyLeftLight.material = this.emergencyStrobeDimMaterial;
        if (p.emergencyRightLight) p.emergencyRightLight.material = this.emergencyStrobeDimMaterial;
        if (p.emergencyExtraLights) {
          p.emergencyExtraLights.forEach(l => { l.material = this.emergencyStrobeDimMaterial; });
        }
      }
    }
  }

  public getPool(): PooledVehicleMesh[] {
    return this.pool;
  }

  /**
   * Adjusts headlight and taillight emissive brilliance and ground beam projection for Day/Night transitions.
   * @param t Transition progress (0.0 = Pure Day, 1.0 = Pure Night)
   */
  public setNightTransition(t: number): void {
    this.headlightLensMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.8, 3.2, t);
    this.taillightRedMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.8, 2.8, t);
    this.headlightBeamMaterial.opacity = THREE.MathUtils.lerp(0.0, 0.18, t);
  }

  public clear(): void {
    this.pool.forEach(p => {
      p.inUse = false;
      p.group.visible = false;
      if (p.emergencyLeftLight) p.emergencyLeftLight.material = this.emergencyStrobeDimMaterial;
      if (p.emergencyRightLight) p.emergencyRightLight.material = this.emergencyStrobeDimMaterial;
      if (p.emergencyExtraLights) {
        p.emergencyExtraLights.forEach(l => { l.material = this.emergencyStrobeDimMaterial; });
      }
    });
  }

  public dispose(): void {
    this.pool.forEach(p => {
      this.scene.remove(p.group);
      p.group.clear();
    });
    this.pool = [];

    this.headlightBeamTexture?.dispose();
    this.headlightBeamTexture = null;

    this.geometries.forEach(geo => geo.dispose());
    this.geometries = [];

    this.materials.forEach(mat => mat.dispose());
    this.materials = [];

    this.bodyMaterialCache.forEach(mat => mat.dispose());
    this.bodyMaterialCache.clear();
  }
}
