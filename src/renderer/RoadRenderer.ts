import * as THREE from 'three';
import { ModelLoader } from './ModelLoader';

export interface RoadDimensions {
  roadWidth: number;
  roadLength: number;
  laneCountPerDirection: number;
  stopLineOffset: number;
  crosswalkStartOffset: number;
  crosswalkEndOffset: number;
}

export const DEFAULT_ROAD_DIMENSIONS: RoadDimensions = {
  roadWidth: 16,
  roadLength: 120,
  laneCountPerDirection: 2,
  stopLineOffset: 11.5,
  crosswalkStartOffset: 8.5,
  crosswalkEndOffset: 10.5
};

/**
 * Procedural Stylized Low-Poly City Intersection Renderer matching the reference image.
 * Features:
 * - Four-way urban road intersection with dark grey asphalt, clean double center lines,
 *   dashed lane dividers, stop lines and zebra crossings on all four approaches.
 *   (Strictly omits tram tracks and tram per instructions).
 * - Broad light-grey pavements with defined granite curbs.
 * - South-West Quadrant: Lush walled park with green metal railing, brick pillars, winding cream paths,
 *   benches, billboards, red vending machines, and faceted pine and leafy trees.
 * - North-East & North Quadrants: City skyline with 7-story Orange Tower (rooftop helipad & red helicopter),
 *   8-story modern Grey Office Tower with vertical mullions, 4-story Red Brick apartment block,
 *   3-story yellow shop building, blue-grey mid-rise, background apartments, and blue bus stop shelter.
 * - North-West Quadrant: Suburban green plots with houses, fences, trees, and roadside billboards.
 * - South-East Quadrant: Single-story Burger Diner with 3D burger sign, bicycle rack, fenced yard,
 *   bus shelter, and low profile maintaining clear isometric sightlines.
 * - Street details: Curved gooseneck streetlights, curb bollards, utility kiosks, and decorative pedestrians.
 */
export class RoadRenderer {
  private group: THREE.Group;
  private dimensions: RoadDimensions;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private loadedModelGroups: THREE.Group[] = [];
  private isDisposed: boolean = false;

  // Day/Night lighting & emissive materials
  private streetlightBulbMat!: THREE.MeshStandardMaterial;
  private warmNightWindowMat!: THREE.MeshStandardMaterial;
  private streetLightPoolMat!: THREE.MeshBasicMaterial;
  private streetLightPoolTexture: THREE.Texture | null = null;
  private currentNightProgress: number = 0.0;
  private importedWindowMaterials: Array<{ material: THREE.MeshStandardMaterial; maxIntensity: number }> = [];

  constructor(dimensions: RoadDimensions = DEFAULT_ROAD_DIMENSIONS) {
    this.dimensions = dimensions;
    this.group = new THREE.Group();
    this.group.name = 'RoadEnvironment';

    this.initDayNightMaterials();

    // Preload all essential Quaternius assets concurrently for fast startup
    if (typeof window !== 'undefined') {
      ModelLoader.preloadAssets([
        '/models/quaternius/Building_Small_1.gltf',
        '/models/quaternius/Building_Medium_2_001.gltf',
        '/models/quaternius/Building_Large_2.gltf',
        '/models/quaternius/Prop_ACUnit.gltf',
        '/models/quaternius/Prop_Bollard.gltf',
        '/models/quaternius/Prop_Planter_Single.gltf',
        '/models/quaternius/Sidewalk_Planter.gltf',
        '/models/quaternius/Prop_Drain.gltf',
        '/models/quaternius/Prop_ManholeCover.gltf',
        '/models/quaternius/Roof_SlateCornice_Window_1.gltf',
        '/models/quaternius/Roof_SlateCornice_Corner.gltf',
        '/models/quaternius/Roof_SlateCornice_Center.gltf',
        '/models/quaternius/Entrance_Concrete_2x1.gltf',
        '/models/quaternius/Entrance_Concrete_2x2.gltf',
        '/models/quaternius/Stairs_Entrance_Concrete.gltf',
        '/models/quaternius/Door_1.gltf',
        '/models/quaternius/Door_2.gltf',
        '/models/quaternius/Door_3.gltf',
        '/models/quaternius/DoorFrame_Metal_Single.gltf',
        '/models/quaternius/Roof_4x4.gltf',
        '/models/quaternius/Roof_2x2.gltf',
        '/models/quaternius/Roof_Slate_Center.gltf',
        '/models/quaternius/Roof_Slate_Corner.gltf',
        '/models/quaternius/Cornice_Metal_Center.gltf',
        '/models/quaternius/Cornice_Brick_Center.gltf',
        '/models/quaternius/Cornice_Trim_Center.gltf'
      ]);
    }

    this.buildGround();
    this.buildRoads();
    this.buildMarkings();
    this.buildSidewalks();
    this.buildWalledPark();
    this.buildSouthWestUrbanZone();
    this.buildSkyline();
    this.buildSuburbanQuarter();
    this.buildBurgerDinerQuarter();
    this.buildStreetFurnitureAndPedestrians();
  }

  public getRoot(): THREE.Group {
    return this.group;
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geom: T): T {
    this.geometries.push(geom);
    return geom;
  }

  private trackMaterial<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  /**
   * Generates a soft, feathered radial gradient canvas texture for streetlights.
   * Produces authentic, smooth ground illumination with zero hard circular edges or distracting geometry.
   */
  private createFeatheredRadialGradientTexture(): THREE.Texture {
    if (typeof document === 'undefined') {
      return new THREE.Texture();
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    // Warm golden amber center that smoothly decays quadratically to pure transparent
    gradient.addColorStop(0.0, 'rgba(255, 238, 195, 0.88)');
    gradient.addColorStop(0.20, 'rgba(255, 222, 165, 0.58)');
    gradient.addColorStop(0.45, 'rgba(255, 205, 135, 0.28)');
    gradient.addColorStop(0.70, 'rgba(255, 190, 105, 0.09)');
    gradient.addColorStop(1.0, 'rgba(255, 180, 85, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  private initDayNightMaterials(): void {
    this.streetlightBulbMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.05,
        roughness: 0.2
      })
    );

    this.warmNightWindowMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.0,
        roughness: 0.35,
        metalness: 0.1,
        flatShading: true
      })
    );

    this.streetLightPoolTexture = this.createFeatheredRadialGradientTexture();
    this.streetLightPoolMat = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        map: this.streetLightPoolTexture,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  /**
   * Updates streetlight bulb brilliance, procedural building window warmth,
   * feathered ground light pools, and all imported Quaternius building windows.
   * @param t Transition progress (0.0 = Day, 1.0 = Night)
   */
  public setNightTransition(t: number): void {
    this.currentNightProgress = t;
    this.streetlightBulbMat.emissiveIntensity = THREE.MathUtils.lerp(0.05, 2.8, t);
    this.warmNightWindowMat.emissiveIntensity = THREE.MathUtils.lerp(0.0, 2.2, t);
    this.streetLightPoolMat.opacity = THREE.MathUtils.lerp(0.0, 0.65, t);

    // Modulate all tracked imported building window materials
    for (let i = 0; i < this.importedWindowMaterials.length; i++) {
      const entry = this.importedWindowMaterials[i];
      entry.material.emissiveIntensity = entry.maxIntensity * t;
    }
  }

  public getImportedWindowMaterialsCount(): number {
    return this.importedWindowMaterials.length;
  }

  /**
   * Surrounding terrain base plane and district foundation plazas.
   */
  private buildGround(): void {
    const { roadWidth, roadLength } = this.dimensions;
    const halfWidth = roadWidth / 2;

    // 1. Base terrain meadow green
    const groundGeo = this.trackGeometry(new THREE.PlaneGeometry(320, 320));
    const groundMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x3e6545, // Rich urban meadow lawn green
        roughness: 0.88,
        metalness: 0.05,
        flatShading: true
      })
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    ground.name = 'GroundTerrain';
    this.group.add(ground);

    // 2. Roadbed underlay
    const roadbedMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1a1e24,
        roughness: 0.95
      })
    );
    const bedNS = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(roadWidth + 1.0, roadLength * 2)), roadbedMat);
    bedNS.name = 'AsphaltRoadbed';
    bedNS.rotation.x = -Math.PI / 2;
    bedNS.position.y = -0.04;
    this.group.add(bedNS);

    const bedEW = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(roadLength * 2, roadWidth + 1.0)), roadbedMat);
    bedEW.name = 'AsphaltRoadbed_EW';
    bedEW.rotation.x = -Math.PI / 2;
    bedEW.position.y = -0.04;
    this.group.add(bedEW);

    // 3. District Foundation Plazas (eliminates vast empty white/grey voids)
    const plazaMatDowntown = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x242d38, // Dark slate urban plaza pavement for downtown skyline
        roughness: 0.78,
        flatShading: true
      })
    );
    const plazaMatUrban = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x2e3846, // Mid-grey paved courtyard under NW quarter
        roughness: 0.8,
        flatShading: true
      })
    );
    const plazaMatDiner = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x374151, // Warm terrace paving under SE diner & boutique
        roughness: 0.75,
        flatShading: true
      })
    );

    // NE Downtown Plaza foundation
    const nePlaza = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(64, 0.22, 64)), plazaMatDowntown);
    nePlaza.name = 'DistrictPlaza_NE';
    nePlaza.position.set(halfWidth + 37, 0.11, -(halfWidth + 37));
    nePlaza.receiveShadow = true;
    this.group.add(nePlaza);

    // NW Urban Plaza foundation
    const nwPlaza = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(56, 0.22, 54)), plazaMatUrban);
    nwPlaza.name = 'DistrictPlaza_NW';
    nwPlaza.position.set(-(halfWidth + 37), 0.11, -(halfWidth + 37));
    nwPlaza.receiveShadow = true;
    this.group.add(nwPlaza);

    // SE Diner & Commercial District Plaza foundation (covers diner, commercial street block, and towers)
    const sePlaza = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(68, 0.22, 54)), plazaMatDiner);
    sePlaza.name = 'DistrictPlaza_SE';
    sePlaza.position.set(halfWidth + 42, 0.11, halfWidth + 30);
    sePlaza.receiveShadow = true;
    this.group.add(sePlaza);

    // SW Backdrop Plaza foundation (paved terrace behind South Park wall for background towers)
    const swBackdropPlaza = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(68, 0.22, 28)), plazaMatDowntown);
    swBackdropPlaza.name = 'DistrictPlaza_SW_Backdrop';
    swBackdropPlaza.position.set(-38, 0.11, 66);
    swBackdropPlaza.receiveShadow = true;
    this.group.add(swBackdropPlaza);

    // SW West Flank Plaza foundation (paved terrace west of Park wall for high-rise and mid-rise towers)
    const swWestPlaza = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(32, 0.22, 60)), plazaMatDowntown);
    swWestPlaza.name = 'DistrictPlaza_SW_WestFlank';
    swWestPlaza.position.set(-70, 0.11, 38);
    swWestPlaza.receiveShadow = true;
    this.group.add(swWestPlaza);
  }

  /**
   * Asphalt intersection junction and 4 intersecting road arms.
   * Note: Metro/tram tracks are completely omitted. Road is full continuous asphalt.
   */
  private buildRoads(): void {
    const { roadWidth, roadLength } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const armLength = roadLength - halfWidth;

    const asphaltMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x272b33, // Clean dark grey asphalt from reference
        roughness: 0.82,
        metalness: 0.1,
        flatShading: true
      })
    );

    // Center junction
    const centerGeo = this.trackGeometry(new THREE.PlaneGeometry(roadWidth, roadWidth));
    const centerMesh = new THREE.Mesh(centerGeo, asphaltMat);
    centerMesh.rotation.x = -Math.PI / 2;
    centerMesh.receiveShadow = true;
    centerMesh.name = 'IntersectionCenter';
    this.group.add(centerMesh);

    // North & South arms (along Z)
    const nsGeo = this.trackGeometry(new THREE.PlaneGeometry(roadWidth, armLength));

    const northRoad = new THREE.Mesh(nsGeo, asphaltMat);
    northRoad.rotation.x = -Math.PI / 2;
    northRoad.position.set(0, 0, -(halfWidth + armLength / 2));
    northRoad.receiveShadow = true;
    this.group.add(northRoad);

    const southRoad = new THREE.Mesh(nsGeo, asphaltMat);
    southRoad.rotation.x = -Math.PI / 2;
    southRoad.position.set(0, 0, halfWidth + armLength / 2);
    southRoad.receiveShadow = true;
    this.group.add(southRoad);

    // East & West arms (along X)
    const ewGeo = this.trackGeometry(new THREE.PlaneGeometry(armLength, roadWidth));

    const eastRoad = new THREE.Mesh(ewGeo, asphaltMat);
    eastRoad.rotation.x = -Math.PI / 2;
    eastRoad.position.set(halfWidth + armLength / 2, 0, 0);
    eastRoad.receiveShadow = true;
    this.group.add(eastRoad);

    const westRoad = new THREE.Mesh(ewGeo, asphaltMat);
    westRoad.rotation.x = -Math.PI / 2;
    westRoad.position.set(-(halfWidth + armLength / 2), 0, 0);
    westRoad.receiveShadow = true;
    this.group.add(westRoad);
  }

  /**
   * Crisp road markings: double white center lines, dashed lane dividers,
   * solid stop lines, and bold zebra crossings on all four approaches.
   */
  private buildMarkings(): void {
    const { roadWidth, roadLength, stopLineOffset, crosswalkStartOffset, crosswalkEndOffset } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const armLength = roadLength - halfWidth;
    const yMarking = 0.02;

    const whiteMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc, // Crisp clean white marking
        roughness: 0.4,
        metalness: 0.05,
        flatShading: true
      })
    );

    // 1. Center Double White Lines (as in modern stylized reference)
    const centerLineWidth = 0.22;
    const centerGap = 0.25;

    // North & South center lines
    const lineNSGeo = this.trackGeometry(new THREE.PlaneGeometry(centerLineWidth, armLength - 4));
    [-centerGap, centerGap].forEach(offset => {
      const nLine = new THREE.Mesh(lineNSGeo, whiteMat);
      nLine.rotation.x = -Math.PI / 2;
      nLine.position.set(offset, yMarking, -(halfWidth + 2 + (armLength - 4) / 2));
      this.group.add(nLine);

      const sLine = new THREE.Mesh(lineNSGeo, whiteMat);
      sLine.rotation.x = -Math.PI / 2;
      sLine.position.set(offset, yMarking, halfWidth + 2 + (armLength - 4) / 2);
      this.group.add(sLine);
    });

    // East & West center lines
    const lineEWGeo = this.trackGeometry(new THREE.PlaneGeometry(armLength - 4, centerLineWidth));
    [-centerGap, centerGap].forEach(offset => {
      const eLine = new THREE.Mesh(lineEWGeo, whiteMat);
      eLine.rotation.x = -Math.PI / 2;
      eLine.position.set(halfWidth + 2 + (armLength - 4) / 2, yMarking, offset);
      this.group.add(eLine);

      const wLine = new THREE.Mesh(lineEWGeo, whiteMat);
      wLine.rotation.x = -Math.PI / 2;
      wLine.position.set(-(halfWidth + 2 + (armLength - 4) / 2), yMarking, offset);
      this.group.add(wLine);
    });

    // 2. Dashed White Lane Dividers (at +/-4m)
    const dashLength = 3.2;
    const dashGap = 3.0;
    const dashWidth = 0.22;
    const dashGeo = this.trackGeometry(new THREE.PlaneGeometry(dashWidth, dashLength));
    const dashGeoH = this.trackGeometry(new THREE.PlaneGeometry(dashLength, dashWidth));

    const totalDashes = Math.floor((armLength - 8) / (dashLength + dashGap));
    for (let i = 0; i < totalDashes; i++) {
      const dist = halfWidth + 4 + i * (dashLength + dashGap) + dashLength / 2;

      // North & South lanes
      [-4, 4].forEach(laneX => {
        const dN = new THREE.Mesh(dashGeo, whiteMat);
        dN.rotation.x = -Math.PI / 2;
        dN.position.set(laneX, yMarking, -dist);
        this.group.add(dN);

        const dS = new THREE.Mesh(dashGeo, whiteMat);
        dS.rotation.x = -Math.PI / 2;
        dS.position.set(laneX, yMarking, dist);
        this.group.add(dS);
      });

      // East & West lanes
      [-4, 4].forEach(laneZ => {
        const dE = new THREE.Mesh(dashGeoH, whiteMat);
        dE.rotation.x = -Math.PI / 2;
        dE.position.set(dist, yMarking, laneZ);
        this.group.add(dE);

        const dW = new THREE.Mesh(dashGeoH, whiteMat);
        dW.rotation.x = -Math.PI / 2;
        dW.position.set(-dist, yMarking, laneZ);
        this.group.add(dW);
      });
    }

    // 3. Solid White Stop Lines
    const stopLineWidth = halfWidth - 0.5;
    const stopLineDepth = 0.85;
    const stopLineGeoV = this.trackGeometry(new THREE.PlaneGeometry(stopLineWidth, stopLineDepth));
    const stopLineGeoH = this.trackGeometry(new THREE.PlaneGeometry(stopLineDepth, stopLineWidth));

    // North approach (incoming on West side x < 0)
    const stopN = new THREE.Mesh(stopLineGeoV, whiteMat);
    stopN.name = 'StopLine_N';
    stopN.rotation.x = -Math.PI / 2;
    stopN.position.set(-stopLineWidth / 2 - 0.25, yMarking, -stopLineOffset);
    this.group.add(stopN);

    // South approach (incoming on East side x > 0)
    const stopS = new THREE.Mesh(stopLineGeoV, whiteMat);
    stopS.name = 'StopLine_S';
    stopS.rotation.x = -Math.PI / 2;
    stopS.position.set(stopLineWidth / 2 + 0.25, yMarking, stopLineOffset);
    this.group.add(stopS);

    // East approach (incoming on North side z < 0)
    const stopE = new THREE.Mesh(stopLineGeoH, whiteMat);
    stopE.name = 'StopLine_E';
    stopE.rotation.x = -Math.PI / 2;
    stopE.position.set(stopLineOffset, yMarking, -stopLineWidth / 2 - 0.25);
    this.group.add(stopE);

    // West approach (incoming on South side z > 0)
    const stopW = new THREE.Mesh(stopLineGeoH, whiteMat);
    stopW.name = 'StopLine_W';
    stopW.rotation.x = -Math.PI / 2;
    stopW.position.set(-stopLineOffset, yMarking, stopLineWidth / 2 + 0.25);
    this.group.add(stopW);

    // 4. Zebra Pedestrian Crosswalks on all 4 approaches
    const zebraLength = crosswalkEndOffset - crosswalkStartOffset;
    const zebraStripeWidth = 0.75;
    const zebraSpacing = 1.3;
    const zebraCenterDist = (crosswalkStartOffset + crosswalkEndOffset) / 2;

    const stripeGeoV = this.trackGeometry(new THREE.PlaneGeometry(zebraStripeWidth, zebraLength));
    const stripeGeoH = this.trackGeometry(new THREE.PlaneGeometry(zebraLength, zebraStripeWidth));

    const numStripes = Math.floor((roadWidth - 1.5) / zebraSpacing);
    const startOffset = -((numStripes - 1) * zebraSpacing) / 2;

    for (let s = 0; s < numStripes; s++) {
      const pos = startOffset + s * zebraSpacing;

      // North crosswalk
      const zN = new THREE.Mesh(stripeGeoV, whiteMat);
      zN.name = 'Crosswalk_N';
      zN.rotation.x = -Math.PI / 2;
      zN.position.set(pos, yMarking, -zebraCenterDist);
      this.group.add(zN);

      // South crosswalk
      const zS = new THREE.Mesh(stripeGeoV, whiteMat);
      zS.name = 'Crosswalk_S';
      zS.rotation.x = -Math.PI / 2;
      zS.position.set(pos, yMarking, zebraCenterDist);
      this.group.add(zS);

      // East crosswalk
      const zE = new THREE.Mesh(stripeGeoH, whiteMat);
      zE.name = 'Crosswalk_E';
      zE.rotation.x = -Math.PI / 2;
      zE.position.set(zebraCenterDist, yMarking, pos);
      this.group.add(zE);

      // West crosswalk
      const zW = new THREE.Mesh(stripeGeoH, whiteMat);
      zW.name = 'Crosswalk_W';
      zW.rotation.x = -Math.PI / 2;
      zW.position.set(-zebraCenterDist, yMarking, pos);
      this.group.add(zW);
    }
  }

  /**
   * Broad light-grey pavements with defined granite curbs, storm drains, and manhole covers.
   */
  private buildSidewalks(): void {
    const { roadWidth, roadLength } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const curbHeight = 0.22;
    const walkWidth = 5.2; // 5.2m wide pedestrian sidewalk ribbon along road edges

    const sidewalkMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xcfd4dc, // Light grey concrete paver tone
        roughness: 0.72,
        metalness: 0.05,
        flatShading: true
      })
    );

    const curbMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x64748b, // Defined granite curb edge
        roughness: 0.65,
        metalness: 0.1,
        flatShading: true
      })
    );

    const armLength = roadLength - halfWidth;
    const curbThickness = 0.35;

    // 4 Corner sidewalk ribbons
    const corners = [
      { sx: 1, sz: 1 },
      { sx: 1, sz: -1 },
      { sx: -1, sz: 1 },
      { sx: -1, sz: -1 }
    ];

    corners.forEach(({ sx, sz }) => {
      // NS sidewalk strip
      const nsGeo = this.trackGeometry(new THREE.BoxGeometry(walkWidth, curbHeight, armLength));
      const nsMesh = new THREE.Mesh(nsGeo, sidewalkMat);
      nsMesh.position.set(sx * (halfWidth + walkWidth / 2), curbHeight / 2, sz * (halfWidth + armLength / 2));
      nsMesh.receiveShadow = true;
      this.group.add(nsMesh);

      // EW sidewalk strip (non-overlapping)
      const ewLength = armLength - walkWidth;
      const ewGeo = this.trackGeometry(new THREE.BoxGeometry(ewLength, curbHeight, walkWidth));
      const ewMesh = new THREE.Mesh(ewGeo, sidewalkMat);
      ewMesh.position.set(sx * (halfWidth + walkWidth + ewLength / 2), curbHeight / 2, sz * (halfWidth + walkWidth / 2));
      ewMesh.receiveShadow = true;
      this.group.add(ewMesh);

      // Granite curb along road edges
      const curbHGeo = this.trackGeometry(new THREE.BoxGeometry(armLength, curbHeight + 0.04, curbThickness));
      const curbH = new THREE.Mesh(curbHGeo, curbMat);
      curbH.position.set(sx * (halfWidth + armLength / 2), (curbHeight + 0.04) / 2, sz * (halfWidth + curbThickness / 2));
      curbH.receiveShadow = true;
      this.group.add(curbH);

      const curbVGeo = this.trackGeometry(new THREE.BoxGeometry(curbThickness, curbHeight + 0.04, armLength));
      const curbV = new THREE.Mesh(curbVGeo, curbMat);
      curbV.position.set(sx * (halfWidth + curbThickness / 2), (curbHeight + 0.04) / 2, sz * (halfWidth + armLength / 2));
      curbV.receiveShadow = true;
      this.group.add(curbV);
    });

    // Quaternius Storm Drain grates (Prop_Drain.gltf) along the road gutters
    const drainGutterOffsets = [
      { x: -8.35, z: -12.0, rot: 0 },
      { x: 8.35, z: -12.0, rot: 0 },
      { x: -8.35, z: 12.0, rot: 0 },
      { x: 8.35, z: 12.0, rot: 0 },
      { x: -12.0, z: -8.35, rot: Math.PI / 2 },
      { x: 12.0, z: -8.35, rot: Math.PI / 2 },
      { x: -12.0, z: 8.35, rot: Math.PI / 2 },
      { x: 12.0, z: 8.35, rot: Math.PI / 2 }
    ];
    drainGutterOffsets.forEach(d => {
      this.placeGLTF(
        '/models/quaternius/Prop_Drain.gltf',
        d.x,
        0.02,
        d.z,
        d.rot,
        1.0,
        undefined,
        { castShadow: false, receiveShadow: true }
      );
    });

    // Quaternius Cast-Iron Utility Manhole Covers (Prop_ManholeCover.gltf) in outer lanes
    const manholeLocations = [
      { x: 4.0, z: -26.0 },
      { x: -4.0, z: 26.0 },
      { x: 26.0, z: 4.0 },
      { x: -26.0, z: -4.0 }
    ];
    manholeLocations.forEach(m => {
      this.placeGLTF(
        '/models/quaternius/Prop_ManholeCover.gltf',
        m.x,
        0.02,
        m.z,
        0,
        1.0,
        undefined,
        { castShadow: false, receiveShadow: true }
      );
    });
  }

  /**
   * South-West Quadrant: The Lush Walled Park (exactly as seen in reference).
   * Features:
   * - Dark green iron railing fence with brick pillars and low stone wall enclosing the park.
   * - Winding cream walking paths on rich grass terrain.
   * - Mix of faceted stepped-cone pine trees (dark green) and rounded geometric broadleaf trees.
   * - Park benches placed along paths.
   * - Sidewalk perimeter details outside fence: billboards, red vending machines, bollards.
   */
  private buildWalledPark(): void {
    const { roadWidth } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const parkOriginX = -(halfWidth + 4.5);
    const parkOriginZ = halfWidth + 4.5;

    const parkGrassMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x629c6d, // Lush vibrant park lawn
        roughness: 0.85,
        flatShading: true
      })
    );

    const pathMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xe2ded4, // Cream / beige walking path
        roughness: 0.8,
        flatShading: true
      })
    );

    const pillarMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x9a3412, // Red-brick / terracotta fence pillar
        roughness: 0.8,
        flatShading: true
      })
    );

    const fenceMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x14532d, // Dark green iron fence railing
        roughness: 0.5,
        metalness: 0.4
      })
    );

    const baseWallMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8, // Low stone wall beneath fence
        roughness: 0.7,
        flatShading: true
      })
    );

    // 1. Raised Park Lawn Ground
    const parkSize = 46;
    const lawnGeo = this.trackGeometry(new THREE.BoxGeometry(parkSize, 0.32, parkSize));
    const lawn = new THREE.Mesh(lawnGeo, parkGrassMat);
    lawn.position.set(parkOriginX - parkSize / 2, 0.25 + 0.16, parkOriginZ + parkSize / 2);
    lawn.receiveShadow = true;
    lawn.castShadow = true;
    this.group.add(lawn);

    // 2. Winding Cream Pathways inside park
    const pathPlates = [
      { x: parkOriginX - 6, z: parkOriginZ + 14, w: 4.5, d: 24, rot: 0 },
      { x: parkOriginX - 18, z: parkOriginZ + 20, w: 26, d: 4.2, rot: 0 },
      { x: parkOriginX - 22, z: parkOriginZ + 6, w: 4.5, d: 14, rot: 0 },
      { x: parkOriginX - 32, z: parkOriginZ + 24, w: 4.5, d: 20, rot: 0 },
      { x: parkOriginX - 20, z: parkOriginZ + 36, w: 26, d: 4.2, rot: 0 }
    ];

    pathPlates.forEach(p => {
      const pathGeo = this.trackGeometry(new THREE.BoxGeometry(p.w, 0.05, p.d));
      const pathMesh = new THREE.Mesh(pathGeo, pathMat);
      pathMesh.position.set(p.x, 0.25 + 0.32 + 0.02, p.z);
      pathMesh.receiveShadow = true;
      this.group.add(pathMesh);
    });

    // 3. Park Perimeter Enclosure (Green Iron Fence with Brick Pillars)
    const fenceLength = parkSize;
    const pillarGeo = this.trackGeometry(new THREE.BoxGeometry(0.6, 1.4, 0.6));
    const wallGeoH = this.trackGeometry(new THREE.BoxGeometry(fenceLength, 0.35, 0.3));
    const wallGeoV = this.trackGeometry(new THREE.BoxGeometry(0.3, 0.35, fenceLength));
    const railingGeoH = this.trackGeometry(new THREE.BoxGeometry(3.6, 0.7, 0.08));
    const railingGeoV = this.trackGeometry(new THREE.BoxGeometry(0.08, 0.7, 3.6));

    // Low stone base wall
    const wallNorth = new THREE.Mesh(wallGeoH, baseWallMat);
    wallNorth.position.set(parkOriginX - fenceLength / 2, 0.25 + 0.35 / 2, parkOriginZ);
    this.group.add(wallNorth);

    const wallEast = new THREE.Mesh(wallGeoV, baseWallMat);
    wallEast.position.set(parkOriginX, 0.25 + 0.35 / 2, parkOriginZ + fenceLength / 2);
    this.group.add(wallEast);

    // North side fence & pillars (facing the EW road)
    const numPillarsN = 11;
    for (let i = 0; i < numPillarsN; i++) {
      const px = parkOriginX - i * 4.2;
      const pz = parkOriginZ;

      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 0.25 + 0.7, pz);
      pillar.castShadow = true;
      this.group.add(pillar);

      if (i < numPillarsN - 1 && i !== 2) { // i=2 is park entrance gate opening
        const railing = new THREE.Mesh(railingGeoH, fenceMat);
        railing.position.set(px - 2.1, 0.25 + 0.35 + 0.35, pz);
        railing.castShadow = true;
        this.group.add(railing);
      }
    }

    // East side fence & pillars (facing the NS road)
    const numPillarsE = 11;
    for (let i = 0; i < numPillarsE; i++) {
      const px = parkOriginX;
      const pz = parkOriginZ + i * 4.2;

      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 0.25 + 0.7, pz);
      pillar.castShadow = true;
      this.group.add(pillar);

      if (i < numPillarsE - 1 && i !== 2) { // i=2 is park entrance gate opening
        const railing = new THREE.Mesh(railingGeoV, fenceMat);
        railing.position.set(px, 0.25 + 0.35 + 0.35, pz + 2.1);
        railing.castShadow = true;
        this.group.add(railing);
      }
    }

    // 4. Dense Mixed Geometric Trees inside the Park
    // Matching reference: Stepped conical pines + rounded faceted deciduous trees
    const parkTreePlacements = [
      // Tall pine trees (stepped cone)
      { x: parkOriginX - 5, z: parkOriginZ + 7, type: 'pine', scale: 1.15, col: 0x14532d },
      { x: parkOriginX - 8, z: parkOriginZ + 22, type: 'pine', scale: 1.25, col: 0x166534 },
      { x: parkOriginX - 14, z: parkOriginZ + 12, type: 'pine', scale: 1.05, col: 0x15803d },
      { x: parkOriginX - 25, z: parkOriginZ + 8, type: 'pine', scale: 1.3, col: 0x14532d },
      { x: parkOriginX - 35, z: parkOriginZ + 14, type: 'pine', scale: 1.2, col: 0x166534 },
      { x: parkOriginX - 12, z: parkOriginZ + 32, type: 'pine', scale: 1.15, col: 0x15803d },
      { x: parkOriginX - 28, z: parkOriginZ + 30, type: 'pine', scale: 1.35, col: 0x14532d },
      { x: parkOriginX - 38, z: parkOriginZ + 36, type: 'pine', scale: 1.2, col: 0x166534 },

      // Faceted broadleaf trees (light/medium green)
      { x: parkOriginX - 12, z: parkOriginZ + 6, type: 'deciduous', scale: 1.1, col: 0x22c55e },
      { x: parkOriginX - 18, z: parkOriginZ + 15, type: 'deciduous', scale: 1.2, col: 0x16a34a },
      { x: parkOriginX - 28, z: parkOriginZ + 18, type: 'deciduous', scale: 1.15, col: 0x4ade80 },
      { x: parkOriginX - 16, z: parkOriginZ + 26, type: 'deciduous', scale: 1.05, col: 0x15803d },
      { x: parkOriginX - 36, z: parkOriginZ + 26, type: 'deciduous', scale: 1.25, col: 0x22c55e },
      { x: parkOriginX - 22, z: parkOriginZ + 32, type: 'deciduous', scale: 1.1, col: 0x16a34a },
      { x: parkOriginX - 30, z: parkOriginZ + 40, type: 'deciduous', scale: 1.2, col: 0x4ade80 }
    ];

    parkTreePlacements.forEach(t => {
      this.createTree(t.x, 0.25 + 0.32, t.z, t.type as any, t.scale, t.col);
    });

    // 5. Wooden Park Benches along paths
    const benchPlacements = [
      { x: parkOriginX - 8, z: parkOriginZ + 10, rot: -Math.PI / 4 },
      { x: parkOriginX - 14, z: parkOriginZ + 23, rot: Math.PI / 2 },
      { x: parkOriginX - 26, z: parkOriginZ + 16, rot: 0 },
      { x: parkOriginX - 32, z: parkOriginZ + 32, rot: -Math.PI / 2 }
    ];
    benchPlacements.forEach(b => this.createBench(b.x, 0.25 + 0.32, b.z, b.rot));

    // 6. Sidewalk Perimeter Accessories (Outside Park Fence)
    // Billboards on metal stands
    this.createBillboard(parkOriginX + 1.8, 0.25, parkOriginZ + 10, Math.PI / 2);
    this.createBillboard(parkOriginX - 12, 0.25, parkOriginZ - 1.8, 0);

    // Red snack vending machines outside park
    this.createVendingMachine(parkOriginX + 1.8, 0.25, parkOriginZ + 18, Math.PI / 2, 0xef4444);
    this.createVendingMachine(parkOriginX + 1.8, 0.25, parkOriginZ + 20, Math.PI / 2, 0xf59e0b);

    // Sidewalk bench outside park
    this.createBench(parkOriginX - 24, 0.25, parkOriginZ - 1.8, 0);
  }

  /**
   * South-West Quadrant Backdrop & West Flank Urban Skyline:
   * Frames the lush walled park with tall, varied Quaternius buildings behind the south park wall
   * and along the western perimeter, transforming previously empty meadow into a dense miniature city.
   * Features:
   * - Mid-Rise Tower: Quaternius Building_Medium_2_001 with rooftop AC, stair bulkhead, and vent pipe.
   * - High-Rise Tower: Quaternius Building_Large_2 with wooden water tower, AC unit, and ground stairs.
   * - Corner Boutique: Quaternius Building_Small_1 facing the park with entrance and planters.
   * - Quaternius concrete entrances, stairs, doors, sidewalk planters, and bollards.
   * - Strict preservation: All buildings are placed safely behind/beside the park, preserving open
   *   sightlines of the park trees and the central intersection from the isometric camera.
   */
  private buildSouthWestUrbanZone(): void {
    // 1. SW West Flank High-Rise Tower (Quaternius Building_Large_2 facing North avenue)
    const swWest1X = -68.0;
    const swWest1Z = 20.0;
    const swWest1Fallback = this.createTowerBlock({
      x: swWest1X,
      z: swWest1Z,
      w: 16.6,
      d: 20.6,
      h: 29,
      facadeColor: 0x334155,
      corniceColor: 0x1e293b,
      floors: 7
    });
    this.replaceWithGLTF(
      swWest1Fallback,
      '/models/quaternius/Building_Large_2.gltf',
      swWest1X,
      0.22,
      swWest1Z,
      Math.PI / 2,
      1.05
    );
    // Rooftop equipment on West Flank High-Rise
    this.placeGLTF('/models/quaternius/Roof_4x4.gltf', swWest1X, 0.22 + 28.0 * 1.05 + 0.2, swWest1Z, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', swWest1X - 2.0, 0.22 + 28.0 * 1.05, swWest1Z - 4.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', swWest1X + 2.0, 0.22 + 28.0 * 1.05, swWest1Z + 3.0, 0, 1.0);
    this.createRooftopVentPipe(swWest1X - 3.0, 0.22 + 28.0 * 1.05, swWest1Z + 2.0);

    // Ground entrance facing East towards park
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x2.gltf', swWest1X + 8.3, 0.22, swWest1Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Door_3.gltf', swWest1X + 8.3, 0.22, swWest1Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swWest1X + 8.3, 0.22, swWest1Z + 4.5, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swWest1X + 8.3, 0.22, swWest1Z - 4.5, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', swWest1X + 7.5, 0.22, swWest1Z - 7.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', swWest1X + 7.5, 0.22, swWest1Z + 7.0, 0, 1.0);

    // 2. SW West Flank Mid-Rise Tower (Quaternius Building_Medium_2_001)
    const swWest2X = -68.0;
    const swWest2Z = 38.0;
    const swWest2Fallback = this.createTowerBlock({
      x: swWest2X,
      z: swWest2Z,
      w: 13.0,
      d: 15.0,
      h: 25,
      facadeColor: 0x475569,
      corniceColor: 0x0f172a,
      floors: 6
    });
    this.replaceWithGLTF(
      swWest2Fallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      swWest2X,
      0.22,
      swWest2Z,
      Math.PI / 2,
      1.0
    );
    // Rooftop equipment on West Flank Mid-Rise
    this.createRooftopWaterTower(swWest2X - 2.5, 0.22 + 25.0, swWest2Z);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', swWest2X + 2.5, 0.22 + 25.0, swWest2Z - 2.5, 0, 1.0);
    this.createRooftopBulkhead(swWest2X + 2.0, 0.22 + 25.0, swWest2Z + 2.5);

    // Ground entrance facing East towards park
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x1.gltf', swWest2X + 6.5, 0.22, swWest2Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Door_2.gltf', swWest2X + 6.5, 0.22, swWest2Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swWest2X + 6.5, 0.22, swWest2Z + 4.0, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swWest2X + 6.5, 0.22, swWest2Z - 4.0, Math.PI / 2, 1.0);

    // 3. SW West Flank Boutique Building (Quaternius Building_Small_1)
    const swWest3X = -68.0;
    const swWest3Z = 54.0;
    const swWest3Fallback = this.createTowerBlock({
      x: swWest3X,
      z: swWest3Z,
      w: 14.5,
      d: 12.5,
      h: 17,
      facadeColor: 0x0f766e,
      corniceColor: 0x134e4a,
      floors: 4
    });
    this.replaceWithGLTF(
      swWest3Fallback,
      '/models/quaternius/Building_Small_1.gltf',
      swWest3X,
      0.22,
      swWest3Z,
      Math.PI / 2,
      1.0
    );
    // Rooftop AC unit & bulkhead
    this.placeGLTF('/models/quaternius/Roof_SlateCornice_Window_1.gltf', swWest3X, 0.22 + 16.6, swWest3Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', swWest3X - 2.5, 0.22 + 16.6, swWest3Z - 2.0, 0, 1.0);
    this.createRooftopBulkhead(swWest3X - 2.0, 0.22 + 16.6, swWest3Z + 2.0, 2.5, 2.2, 2.8);

    // Entrance facing East towards park
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x1.gltf', swWest3X + 6.25, 0.22, swWest3Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Door_1.gltf', swWest3X + 6.25, 0.22, swWest3Z, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swWest3X + 6.25, 0.22, swWest3Z + 4.0, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swWest3X + 6.25, 0.22, swWest3Z - 4.0, Math.PI / 2, 1.0);

    // 4. SW South Backdrop Skyscraper (Quaternius Building_Large_2 directly behind South Park wall)
    const swSouth1X = -48.0;
    const swSouth1Z = 62.0;
    const swSouth1Fallback = this.createTowerBlock({
      x: swSouth1X,
      z: swSouth1Z,
      w: 20.6,
      d: 16.6,
      h: 28,
      facadeColor: 0x1e293b,
      corniceColor: 0x0f172a,
      floors: 7
    });
    this.replaceWithGLTF(
      swSouth1Fallback,
      '/models/quaternius/Building_Large_2.gltf',
      swSouth1X,
      0.22,
      swSouth1Z,
      0,
      1.0
    );
    // Rooftop equipment on South Backdrop Skyscraper
    this.createRooftopWaterTower(swSouth1X + 4.0, 0.22 + 28.0, swSouth1Z - 2.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', swSouth1X - 4.5, 0.22 + 28.0, swSouth1Z - 2.0, 0, 1.0);
    this.createRooftopVentPipe(swSouth1X - 1.0, 0.22 + 28.0, swSouth1Z + 3.0);

    // Ground entrance & street props facing North
    this.placeGLTF('/models/quaternius/Stairs_Entrance_Concrete.gltf', swSouth1X, 0.22, swSouth1Z - 8.3, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_3.gltf', swSouth1X, 0.22, swSouth1Z - 8.3, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swSouth1X + 6.0, 0.22, swSouth1Z - 8.3, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swSouth1X - 6.0, 0.22, swSouth1Z - 8.3, 0, 1.0);

    // 5. SW South Backdrop Mid-Rise (Quaternius Building_Medium_2_001 directly behind South Park wall)
    const swSouth2X = -26.0;
    const swSouth2Z = 62.0;
    const swSouth2Fallback = this.createTowerBlock({
      x: swSouth2X,
      z: swSouth2Z,
      w: 15.0,
      d: 13.0,
      h: 26,
      facadeColor: 0x52525b,
      corniceColor: 0x27272a,
      floors: 6
    });
    this.replaceWithGLTF(
      swSouth2Fallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      swSouth2X,
      0.22,
      swSouth2Z,
      0,
      1.05
    );
    // Rooftop equipment on South Backdrop Mid-Rise
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', swSouth2X + 4.0, 0.22 + 25.0 * 1.05, swSouth2Z - 2.0, 0, 1.0);
    this.createRooftopBulkhead(swSouth2X - 2.5, 0.22 + 25.0 * 1.05, swSouth2Z);
    this.createRooftopVentPipe(swSouth2X - 4.5, 0.22 + 25.0 * 1.05, swSouth2Z + 2.0);

    // Ground entrance & street props facing North
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x1.gltf', swSouth2X, 0.22, swSouth2Z - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_2.gltf', swSouth2X, 0.22, swSouth2Z - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swSouth2X + 5.5, 0.22, swSouth2Z - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', swSouth2X - 5.5, 0.22, swSouth2Z - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', swSouth2X + 2.0, 0.22, swSouth2Z - 7.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', swSouth2X - 2.0, 0.22, swSouth2Z - 7.5, 0, 1.0);
  }

  /**
   * North-East Quadrant: Signature City Skyline (matching reference).
   * Features:
   * - 7-story Orange Tower with flat roof, rooftop helipad, and miniature red helicopter.
   * - 8-story Modern Grey Office Tower with vertical mullions/pillars.
   * - 4-story Red Brick apartment block with contrasting window grid.
   * - 3-story Yellow shopfront building with blue trim.
   * - 5-story Blue-grey mid-rise building.
   * - Top-right background row of warm yellow/beige apartments.
   * - Blue bus stop shelter on the sidewalk.
   */
  /**
   * North-East Quadrant: Signature City Skyline.
   * Features:
   * - 7-story Orange Tower with flat roof, rooftop helipad, and miniature red helicopter (centerpiece).
   * - 8-story Modern Grey Office Tower with vertical mullions/pillars.
   * - Quaternius Building_Small_1 with detailed rooftop AC units, wooden water tower, and stair penthouse.
   * - Quaternius Building_Medium_2_001 with rooftop AC units and ventilation ducting.
   * - Quaternius Building_Large_2 with rooftop AC units and exhaust pipes.
   * - Background skyline: Varied Quaternius Medium and Large buildings stepped in the far background.
   * - Blue bus stop shelter and news kiosk on the sidewalk.
   */
  private buildSkyline(): void {
    const { roadWidth } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const cornerX = halfWidth + 5.0;
    const cornerZ = -(halfWidth + 5.0);

    // 1. The Helipad Skyscraper: Genuine Quaternius Building_Medium_2_001 with rooftop helipad & helicopter
    const orangeX = 28.0;
    const orangeZ = -24.0;
    const orangeFallback = this.createTowerBlock({
      x: orangeX,
      z: orangeZ,
      w: 15.0,
      d: 13.0,
      h: 26,
      facadeColor: 0xf59e0b,
      corniceColor: 0xd97706,
      floors: 7
    });
    this.replaceWithGLTF(
      orangeFallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      orangeX,
      0.22,
      orangeZ,
      0,
      1.05
    );
    // Helipad platform and miniature red helicopter mounted directly on roof deck
    this.createHelipadWithHelicopter(orangeX, 0.22 + 25.0 * 1.05 + 0.15, orangeZ);
    // Ground entrance & street planters facing South
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x2.gltf', orangeX, 0.22, orangeZ + 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_3.gltf', orangeX, 0.22, orangeZ + 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', orangeX + 5.5, 0.22, orangeZ + 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', orangeX - 5.5, 0.22, orangeZ + 6.5, 0, 1.0);

    // 2. The Modern Downtown Tower: Genuine Quaternius Building_Large_2
    const greyX = 44.0;
    const greyZ = -24.0;
    const greyFallback = this.createTowerBlock({
      x: greyX,
      z: greyZ,
      w: 20.6,
      d: 16.6,
      h: 28,
      facadeColor: 0x94a3b8,
      corniceColor: 0x1e293b,
      floors: 8
    });
    this.replaceWithGLTF(
      greyFallback,
      '/models/quaternius/Building_Large_2.gltf',
      greyX,
      0.22,
      greyZ,
      0,
      1.0
    );
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', greyX - 4.5, 0.22 + 28.0, greyZ - 1.5, 0, 1.0);
    this.createRooftopVentPipe(greyX + 5.0, 0.22 + 28.0, greyZ - 2.0);
    // Ground entrance stairs & planters facing South
    this.placeGLTF('/models/quaternius/Stairs_Entrance_Concrete.gltf', greyX, 0.22, greyZ + 8.3, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_2.gltf', greyX, 0.22, greyZ + 8.3, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', greyX + 6.5, 0.22, greyZ + 8.3, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', greyX - 6.5, 0.22, greyZ + 8.3, 0, 1.0);

    // 3. The Red Brick Building (Left of Orange Tower: Quaternius Building_Small_1)
    const redX = 15.0;
    const redZ = -22.0;
    const redFallback = this.createTowerBlock({
      x: redX,
      z: redZ,
      w: 12.5,
      d: 14.5,
      h: 17,
      facadeColor: 0xb91c1c, // Classic dark red brick
      corniceColor: 0x7f1d1d,
      floors: 4
    });
    this.replaceWithGLTF(
      redFallback,
      '/models/quaternius/Building_Small_1.gltf',
      redX,
      0.25,
      redZ,
      0,
      1.0
    );

    // Detailed rooftop props on Building_Small_1 (AC units, water tower, stair bulkhead, vent pipe)
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', redX - 2.6, 0.25 + 16.6, redZ - 3.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', redX - 4.2, 0.25 + 16.6, redZ - 3.5, 0, 1.0);
    this.createRooftopWaterTower(redX + 2.5, 0.25 + 16.6, redZ - 7.5);
    this.createRooftopBulkhead(redX + 2.2, 0.25 + 16.6, redZ - 2.5);
    this.createRooftopVentPipe(redX - 1.2, 0.25 + 16.6, redZ - 6.0);

    // 4. Blue-Grey Mid-Rise Building (Behind Red Brick Building: Quaternius Building_Medium_2_001)
    const blueX = 15.0;
    const blueZ = -40.0;
    const blueFallback = this.createTowerBlock({
      x: blueX,
      z: blueZ,
      w: 15.0,
      d: 13.0,
      h: 25,
      facadeColor: 0x64748b, // Slate blue-grey
      corniceColor: 0x334155,
      floors: 5
    });
    this.replaceWithGLTF(
      blueFallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      blueX,
      0.25,
      blueZ,
      0,
      1.0
    );

    // Rooftop props on Building_Medium_2_001
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', blueX + 2.5, 0.25 + 24.5, blueZ - 2.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', blueX + 4.0, 0.25 + 24.5, blueZ - 2.0, 0, 1.0);
    this.createRooftopBulkhead(blueX - 2.5, 0.25 + 24.5, blueZ);
    this.createRooftopVentPipe(blueX - 4.5, 0.25 + 24.5, blueZ - 2.0);

    // 5. Tall Downtown Building (Behind Modern Grey Tower: Quaternius Building_Large_2)
    const largeX = 43.0;
    const largeZ = -44.0;
    const largeFallback = this.createTowerBlock({
      x: largeX,
      z: largeZ,
      w: 20.6,
      d: 16.6,
      h: 28,
      facadeColor: 0x16a34a,
      corniceColor: 0x14532d,
      floors: 6
    });
    this.replaceWithGLTF(
      largeFallback,
      '/models/quaternius/Building_Large_2.gltf',
      largeX,
      0.25,
      largeZ,
      0,
      1.0
    );

    // Rooftop props on Building_Large_2
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', largeX - 4.5, 0.25 + 28.0, largeZ - 1.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', largeX - 6.0, 0.25 + 28.0, largeZ - 1.5, 0, 1.0);
    this.createRooftopVentPipe(largeX + 5.0, 0.25 + 28.0, largeZ - 2.0);

    // 6. Far-Right Skyline Buildings (Replacing procedural boxes with Quaternius complete buildings)
    // Mid-rise building at (62, -25)
    const bgMedX = 62.0;
    const bgMedZ = -25.0;
    const bgMedFallback = this.createTowerBlock({
      x: bgMedX,
      z: bgMedZ,
      w: 15.0,
      d: 13.0,
      h: 24,
      facadeColor: 0xfef08a,
      corniceColor: 0x334155,
      floors: 5
    });
    this.replaceWithGLTF(
      bgMedFallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      bgMedX,
      0.25,
      bgMedZ,
      Math.PI,
      0.95
    );
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', bgMedX, 0.25 + 24.5 * 0.95, bgMedZ, 0, 1.0);

    // Tall background tower at (62, -44)
    const bgLargeX = 62.0;
    const bgLargeZ = -44.0;
    const bgLargeFallback = this.createTowerBlock({
      x: bgLargeX,
      z: bgLargeZ,
      w: 20.6,
      d: 16.6,
      h: 29,
      facadeColor: 0xe2e8f0,
      corniceColor: 0x1e293b,
      floors: 6
    });
    this.replaceWithGLTF(
      bgLargeFallback,
      '/models/quaternius/Building_Large_2.gltf',
      bgLargeX,
      0.25,
      bgLargeZ,
      -Math.PI / 2,
      1.05
    );
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', bgLargeX, 0.25 + 28.0 * 1.05, bgLargeZ, 0, 1.0);

    // Street trees along this sidewalk
    this.createTree(cornerX + 12, 0.25, cornerZ + 1.8, 'deciduous', 0.95, 0x22c55e);
    this.createTree(cornerX + 28, 0.25, cornerZ + 1.8, 'deciduous', 0.95, 0x16a34a);
    this.createTree(cornerX + 44, 0.25, cornerZ + 1.8, 'deciduous', 0.95, 0x22c55e);

    // Blue Bus Stop Shelter on the sidewalk
    this.createBusShelter(cornerX + 20, 0.25, cornerZ + 1.8, 0);

    // Small red ticket/news kiosk
    this.createKiosk(cornerX + 38, 0.25, cornerZ + 1.8, 0, 0xdc2626);
  }

  /**
   * North-West Quadrant (Background Left): Varied Urban Skyline.
   * Features:
   * - Quaternius Building_Small_1 facing the avenue with rooftop AC and bulkhead.
   * - Charming boutique building with Quaternius slate mansard roof, dormers, and awning.
   * - Stepped tall Quaternius Medium and Large buildings in the deep background.
   * - Suburban lawns, standing advertising billboards, and trees along the road setback.
   */
  private buildSuburbanQuarter(): void {
    const { roadWidth } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const subX = -(halfWidth + 6.0);
    const subZ = -(halfWidth + 6.0);

    // 1. Quaternius Building_Small_1 in midground facing East towards North road
    const nwSmallX = -24.0;
    const nwSmallZ = -24.0;
    const nwSmallFallback = this.createTowerBlock({
      x: nwSmallX,
      z: nwSmallZ,
      w: 14.5,
      d: 12.5,
      h: 17,
      facadeColor: 0x99f6e4,
      corniceColor: 0x0d9488,
      floors: 4
    });
    this.replaceWithGLTF(
      nwSmallFallback,
      '/models/quaternius/Building_Small_1.gltf',
      nwSmallX,
      0.25,
      nwSmallZ,
      Math.PI / 2,
      1.0
    );
    // Rooftop details on NW Small 1
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', nwSmallX - 3.5, 0.25 + 16.6, nwSmallZ - 2.8, Math.PI / 2, 1.0);
    this.createRooftopBulkhead(nwSmallX - 2.5, 0.25 + 16.6, nwSmallZ + 2.2, 2.6, 2.4, 3.0);
    this.createRooftopVentPipe(nwSmallX - 5.0, 0.25 + 16.6, nwSmallZ - 1.0);
    // Ground entrance & street planters facing East
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x1.gltf', nwSmallX + 6.25, 0.25, nwSmallZ, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Door_1.gltf', nwSmallX + 6.25, 0.25, nwSmallZ, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', nwSmallX + 6.25, 0.25, nwSmallZ + 4.0, Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', nwSmallX + 6.25, 0.25, nwSmallZ - 4.0, Math.PI / 2, 1.0);

    // 2. Assembled Quaternius Boutique Townhouse (replacing plain white building)
    this.createAssembledTownhouse(-44.0, -22.0, 0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', -44.0 + 3.8, 0.25, -22.0 + 3.8, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', -44.0 - 3.8, 0.25, -22.0 + 3.8, 0, 1.0);

    // 3. Deep Background Mid-Rise: Quaternius Building_Medium_2_001
    const nwMedX = -38.0;
    const nwMedZ = -46.0;
    const nwMedFallback = this.createTowerBlock({
      x: nwMedX,
      z: nwMedZ,
      w: 15.0,
      d: 13.0,
      h: 25,
      facadeColor: 0xfef9c3,
      corniceColor: 0xb45309,
      floors: 5
    });
    this.replaceWithGLTF(
      nwMedFallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      nwMedX,
      0.25,
      nwMedZ,
      Math.PI,
      1.0
    );
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', nwMedX + 2.0, 0.25 + 24.5, nwMedZ, 0, 1.0);
    this.createRooftopWaterTower(nwMedX - 2.5, 0.25 + 24.5, nwMedZ);

    // 4. Deep Background Tall Tower: Quaternius Building_Large_2
    const nwLargeX = -58.0;
    const nwLargeZ = -44.0;
    const nwLargeFallback = this.createTowerBlock({
      x: nwLargeX,
      z: nwLargeZ,
      w: 20.6,
      d: 16.6,
      h: 29,
      facadeColor: 0x64748b,
      corniceColor: 0x1e293b,
      floors: 6
    });
    this.replaceWithGLTF(
      nwLargeFallback,
      '/models/quaternius/Building_Large_2.gltf',
      nwLargeX,
      0.25,
      nwLargeZ,
      0,
      1.05
    );
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', nwLargeX, 0.25 + 28.0 * 1.05, nwLargeZ, 0, 1.0);

    // Standing roadside billboards
    this.createBillboard(subX - 8, 0.25, subZ - 1.8, 0);
    this.createBillboard(subX - 28, 0.25, subZ - 1.8, 0);

    // Suburban street trees
    this.createTree(subX - 18, 0.25, subZ - 1.8, 'pine', 1.1, 0x15803d);
    this.createTree(subX - 38, 0.25, subZ - 1.8, 'deciduous', 1.0, 0x16a34a);
  }

  /**
   * South-East Quadrant (Immediate Camera Foreground):
   * Single-story Burger Diner matching reference, plus setback boutique building.
   * Features:
   * - Tan/beige walls, dark roof with bright orange parapet trim.
   * - 3D stylized hamburger logo on the roof/fascia.
   * - Rooftop commercial AC unit and kitchen ventilation exhaust cowl.
   * - Bicycle rack, side yard with tree, bus shelter, and utility kiosk.
   * - Setback boutique building with Quaternius slate mansard roof and dormer windows.
   * - Low foreground height ensures 100% unobstructed view of the central intersection.
   */
  /**
   * South-East Quadrant (Immediate Camera Foreground):
   * Burger Diner Commercial Restaurant & Outdoor Terrace.
   * Features:
   * - Genuine Quaternius Building_Small_1 as the restaurant body (entrance facing the avenue).
   * - Iconic 3D stylized hamburger logo sign on the restaurant fascia.
   * - Commercial kitchen ventilation exhaust cowl duct and rooftop AC unit.
   * - Outdoor dining terrace paved with warm stone, Quaternius stone planters with shrubs.
   * - Bicycle rack, side yard with tree, bus shelter, and utility kiosk.
   * - Setback boutique building with Quaternius slate mansard roof and dormer windows.
   */
  private buildBurgerDinerQuarter(): void {
    const { roadWidth } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const dinerOriginX = halfWidth + 5.0; // 13.0
    const dinerOriginZ = halfWidth + 5.0; // 13.0

    // 1. Single-Story Burger Diner Restaurant (matching reference)
    const dinerX = 23.0;
    const dinerZ = 21.0;
    const dinerW = 11.0; // width along X
    const dinerD = 8.0;  // depth along Z
    const dinerH = 4.6;  // single-story height

    const dinerGroup = new THREE.Group();
    dinerGroup.position.set(dinerX, 0.22, dinerZ);

    const dinerWallMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.65, flatShading: true }) // Warm retro cream diner wall
    );
    const dinerPlinthMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, flatShading: true })
    );
    const dinerParapetMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5, flatShading: true }) // Retro orange diner parapet trim
    );
    const glassMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.85, flatShading: true })
    );

    // Foundation plinth
    const plinth = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(dinerW + 0.3, 0.4, dinerD + 0.3)), dinerPlinthMat);
    plinth.position.y = 0.2;
    plinth.receiveShadow = true;
    dinerGroup.add(plinth);

    // Main Diner Body
    const body = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(dinerW, dinerH - 0.4, dinerD)), dinerWallMat);
    body.position.y = 0.4 + (dinerH - 0.4) / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    dinerGroup.add(body);

    // Front large display windows (facing -X towards West road)
    const winGeoFront = this.trackGeometry(new THREE.BoxGeometry(0.12, 2.2, dinerD * 0.35));
    const winFrontL = new THREE.Mesh(winGeoFront, glassMat);
    winFrontL.position.set(-dinerW / 2 - 0.02, 2.4, 2.2);
    dinerGroup.add(winFrontL);

    const winFrontR = new THREE.Mesh(winGeoFront, glassMat);
    winFrontR.position.set(-dinerW / 2 - 0.02, 2.4, -2.2);
    dinerGroup.add(winFrontR);

    // Side windows (facing -Z towards North road)
    const winGeoSide = this.trackGeometry(new THREE.BoxGeometry(dinerW * 0.35, 2.2, 0.12));
    const winSide = new THREE.Mesh(winGeoSide, glassMat);
    winSide.position.set(1.5, 2.4, -dinerD / 2 - 0.02);
    dinerGroup.add(winSide);

    // Front entrance canopy (facing -X)
    const canopyGeo = this.trackGeometry(new THREE.BoxGeometry(1.6, 0.22, 2.8));
    const canopy = new THREE.Mesh(canopyGeo, dinerParapetMat);
    canopy.position.set(-dinerW / 2 - 0.8, 3.5, 0);
    canopy.castShadow = true;
    dinerGroup.add(canopy);

    // Orange roof parapet trim
    const parapetGeo = this.trackGeometry(new THREE.BoxGeometry(dinerW + 0.35, 0.45, dinerD + 0.35));
    const parapet = new THREE.Mesh(parapetGeo, dinerParapetMat);
    parapet.position.y = dinerH + 0.22;
    parapet.castShadow = true;
    dinerGroup.add(parapet);

    // Flat roof deck
    const roofDeckGeo = this.trackGeometry(new THREE.BoxGeometry(dinerW - 0.4, 0.1, dinerD - 0.4));
    const roofDeckMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x272b33, roughness: 0.9 })
    );
    const roofDeck = new THREE.Mesh(roofDeckGeo, roofDeckMat);
    roofDeck.position.y = dinerH + 0.35;
    roofDeck.receiveShadow = true;
    dinerGroup.add(roofDeck);

    this.group.add(dinerGroup);

    // Front concrete entrance step & Quaternius door
    if (typeof window !== 'undefined') {
      this.placeGLTF(
        '/models/quaternius/Entrance_Concrete_2x1.gltf',
        -dinerW / 2 - 0.05,
        0,
        0,
        Math.PI / 2,
        1.0,
        dinerGroup
      );
      this.placeGLTF(
        '/models/quaternius/Door_1.gltf',
        -dinerW / 2 - 0.05,
        0,
        -0.5,
        Math.PI / 2,
        1.0,
        dinerGroup
      );
      // Rooftop AC unit on diner
      this.placeGLTF(
        '/models/quaternius/Prop_ACUnit.gltf',
        2.5,
        dinerH + 0.35,
        1.5,
        0,
        1.0,
        dinerGroup
      );
    }

    // Commercial kitchen ventilation cowl pipe on diner roof
    this.createRooftopVentPipe(dinerX + 2.0, 0.22 + dinerH + 0.35, dinerZ - 1.5);

    // 2. 3D Hamburger Logo Sign securely mounted on the diner front roof parapet above entrance
    // In world coordinates: x = dinerX - dinerW/2 = 17.5, y = 0.22 + dinerH + 0.2 = 5.02, z = dinerZ = 21.0
    this.createBurgerSign(dinerX - dinerW / 2, 0.22 + dinerH + 0.2, dinerZ);

    // 3. The Building Behind the Floating Burger:
    // Placed setback behind the diner at x = 38.0, z = 28.0 (clears diner with 3m corridor, no overlap!)
    const setbackX = 38.0;
    const setbackZ = 28.0;
    const setbackFallback = this.createTowerBlock({
      x: setbackX,
      z: setbackZ,
      w: 12.5,
      d: 14.5,
      h: 17,
      facadeColor: 0x92400e,
      corniceColor: 0x451a03,
      floors: 4
    });
    this.replaceWithGLTF(
      setbackFallback,
      '/models/quaternius/Building_Small_1.gltf',
      setbackX,
      0.22,
      setbackZ,
      -Math.PI / 2,
      1.0
    );
    this.placeGLTF(
      '/models/quaternius/Prop_ACUnit.gltf',
      setbackX + 1.0,
      0.22 + 17.0,
      setbackZ - 2.0,
      0,
      1.0
    );

    // 4. Outdoor cafe dining terrace & Quaternius planters
    this.placeGLTF('/models/quaternius/Prop_Planter_Single.gltf', dinerOriginX + 4.5, 0.22, dinerOriginZ + 14, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Planter_Single.gltf', dinerOriginX + 4.5, 0.22, dinerOriginZ + 20, 0, 1.0);

    // 5. Bicycle Rack, pocket garden, and sidewalk amenities
    this.createBicycleRack(dinerOriginX + 6, 0.22, dinerOriginZ + 26, Math.PI / 2);
    this.createFencedYardWithTree(22.0, 0.22, 46.0);
    this.createBusShelter(dinerOriginX + 1.8, 0.22, dinerOriginZ + 32, Math.PI / 2);
    this.createElectricalKiosk(dinerOriginX + 1.8, 0.22, dinerOriginZ + 8, Math.PI / 2);

    // 6. East Avenue Retail Boutique (Quaternius Building_Small_1 facing East road)
    const seShopX = 52.0;
    const seShopZ = 22.0;
    const seShopFallback = this.createTowerBlock({
      x: seShopX,
      z: seShopZ,
      w: 12.5,
      d: 14.5,
      h: 17,
      facadeColor: 0xb45309, // Warm amber boutique shopfront
      corniceColor: 0x78350f,
      floors: 4
    });
    this.replaceWithGLTF(
      seShopFallback,
      '/models/quaternius/Building_Small_1.gltf',
      seShopX,
      0.22,
      seShopZ,
      0,
      1.0
    );
    // Rooftop details on retail boutique
    this.placeGLTF('/models/quaternius/Roof_SlateCornice_Window_1.gltf', seShopX, 0.22 + 16.6, seShopZ, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', seShopX - 3.0, 0.22 + 16.6, seShopZ - 2.0, 0, 1.0);
    this.createRooftopBulkhead(seShopX + 2.5, 0.22 + 16.6, seShopZ + 2.0);

    // Ground entrance facing North avenue
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x1.gltf', seShopX, 0.22, seShopZ - 7.25, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_1.gltf', seShopX, 0.22, seShopZ - 7.25, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seShopX + 4.5, 0.22, seShopZ - 7.25, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seShopX - 4.5, 0.22, seShopZ - 7.25, 0, 1.0);

    // 7. East Avenue Mid-Rise Office (Quaternius Building_Medium_2_001 facing East road)
    const seOfficeX = 68.0;
    const seOfficeZ = 22.0;
    const seOfficeFallback = this.createTowerBlock({
      x: seOfficeX,
      z: seOfficeZ,
      w: 15.0,
      d: 13.0,
      h: 25,
      facadeColor: 0x4338ca, // Modern corporate indigo
      corniceColor: 0x312e81,
      floors: 6
    });
    this.replaceWithGLTF(
      seOfficeFallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      seOfficeX,
      0.22,
      seOfficeZ,
      0,
      1.0
    );
    // Rooftop equipment on office mid-rise
    this.createRooftopWaterTower(seOfficeX - 3.0, 0.22 + 25.0, seOfficeZ);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', seOfficeX + 3.0, 0.22 + 25.0, seOfficeZ - 2.0, 0, 1.0);
    this.createRooftopVentPipe(seOfficeX + 1.0, 0.22 + 25.0, seOfficeZ + 2.0);

    // Ground entrance facing North avenue
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x2.gltf', seOfficeX, 0.22, seOfficeZ - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_2.gltf', seOfficeX, 0.22, seOfficeZ - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seOfficeX + 5.5, 0.22, seOfficeZ - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seOfficeX - 5.5, 0.22, seOfficeZ - 6.5, 0, 1.0);

    // 8. South-East Background Skyscraper (Quaternius Building_Large_2 in deep SE plaza)
    const seLargeX = 56.0;
    const seLargeZ = 42.0;
    const seLargeFallback = this.createTowerBlock({
      x: seLargeX,
      z: seLargeZ,
      w: 16.6,
      d: 20.6,
      h: 29,
      facadeColor: 0x1e3a8a, // Rich navy downtown commercial facade
      corniceColor: 0x172554,
      floors: 7
    });
    this.replaceWithGLTF(
      seLargeFallback,
      '/models/quaternius/Building_Large_2.gltf',
      seLargeX,
      0.22,
      seLargeZ,
      -Math.PI / 2,
      1.05
    );
    // Rooftop equipment on Building_Large_2
    this.placeGLTF('/models/quaternius/Roof_4x4.gltf', seLargeX, 0.22 + 28.0 * 1.05 + 0.2, seLargeZ, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', seLargeX - 2.0, 0.22 + 28.0 * 1.05, seLargeZ - 4.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', seLargeX + 3.0, 0.22 + 28.0 * 1.05, seLargeZ + 2.0, 0, 1.0);
    this.createRooftopBulkhead(seLargeX - 2.0, 0.22 + 28.0 * 1.05, seLargeZ + 2.0);
    this.createRooftopVentPipe(seLargeX + 4.0, 0.22 + 28.0 * 1.05, seLargeZ - 3.0);

    // Ground entrance facing West into the plaza promenade
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x2.gltf', seLargeX - 8.3, 0.22, seLargeZ, -Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Door_3.gltf', seLargeX - 8.3, 0.22, seLargeZ, -Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seLargeX - 8.3, 0.22, seLargeZ - 4.0, -Math.PI / 2, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seLargeX - 8.3, 0.22, seLargeZ + 4.0, -Math.PI / 2, 1.0);

    // 9. South-East Southern Mid-Rise Tower (Quaternius Building_Medium_2_001 behind setback building)
    const seMedX = 36.0;
    const seMedZ = 44.0;
    const seMedFallback = this.createTowerBlock({
      x: seMedX,
      z: seMedZ,
      w: 15.0,
      d: 13.0,
      h: 24,
      facadeColor: 0x7c2d12, // Warm terracotta boutique tower
      corniceColor: 0x431407,
      floors: 5
    });
    this.replaceWithGLTF(
      seMedFallback,
      '/models/quaternius/Building_Medium_2_001.gltf',
      seMedX,
      0.22,
      seMedZ,
      0,
      0.95
    );
    // Rooftop equipment on Building_Medium_2_001
    this.createRooftopWaterTower(seMedX - 3.0, 0.22 + 25.0 * 0.95, seMedZ);
    this.placeGLTF('/models/quaternius/Prop_ACUnit.gltf', seMedX + 3.0, 0.22 + 25.0 * 0.95, seMedZ - 2.0, 0, 1.0);
    this.createRooftopVentPipe(seMedX + 1.0, 0.22 + 25.0 * 0.95, seMedZ + 2.0);

    // Entrance facing North towards the courtyard
    this.placeGLTF('/models/quaternius/Entrance_Concrete_2x1.gltf', seMedX, 0.22, seMedZ - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Door_2.gltf', seMedX, 0.22, seMedZ - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seMedX - 5.5, 0.22, seMedZ - 6.5, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', seMedX + 5.5, 0.22, seMedZ - 6.5, 0, 1.0);

    // 10. South-East Central Promenade & Plaza Amenities
    // Quaternius stone planters creating pedestrian corridors
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', 26.0, 0.22, 33.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', 44.0, 0.22, 33.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', 62.0, 0.22, 33.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', 22.0, 0.22, 30.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', 22.0, 0.22, 36.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', 48.0, 0.22, 30.0, 0, 1.0);
    this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', 48.0, 0.22, 36.0, 0, 1.0);

    // Plaza benches and pedestrians
    this.createBench(26.0, 0.22, 38.0, 0);
    this.createBench(44.0, 0.22, 38.0, 0);
    this.createPedestrian(28.0, 0.22, 36.0, 0x3b82f6);
    this.createPedestrian(42.0, 0.22, 36.0, 0x10b981);
    this.createPedestrian(36.0, 0.22, 40.0, 0xec4899);
    this.createPedestrian(60.0, 0.22, 28.0, 0xf59e0b);
  }

  /**
   * Creates a stylized 3D hamburger icon sign matching the reference diner logo:
   * Bottom bun, brown burger patty, melted cheese, green lettuce ruffle, top seeded bun,
   * securely mounted to the building parapet on steel mounting stanchion posts.
   */
  private createBurgerSign(x: number, y: number, z: number): void {
    const burgerGroup = new THREE.Group();
    burgerGroup.position.set(x, y, z);
    burgerGroup.rotation.y = -Math.PI / 2;

    const bunMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6, flatShading: true }));
    const pattyMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x3e1f0e, roughness: 0.8, flatShading: true }));
    const cheeseMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, flatShading: true }));
    const lettuceMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5, flatShading: true }));
    const steelMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 }));

    // Twin sturdy steel mounting brackets anchoring the sign firmly into the building roof parapet
    const bracketGeo = this.trackGeometry(new THREE.BoxGeometry(0.08, 0.7, 0.08));
    [-0.55, 0.55].forEach(offsetZ => {
      const post = new THREE.Mesh(bracketGeo, steelMat);
      post.position.set(0, 0.35, offsetZ);
      post.castShadow = true;
      burgerGroup.add(post);
    });

    // Horizontal mounting bar
    const barGeo = this.trackGeometry(new THREE.BoxGeometry(0.1, 0.08, 1.3));
    const bar = new THREE.Mesh(barGeo, steelMat);
    bar.position.set(0, 0.7, 0);
    burgerGroup.add(bar);

    // Bottom bun (resting on mounting bar at y = 0.7)
    const bottomBun = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.85, 0.8, 0.22, 12)), bunMat);
    bottomBun.position.y = 0.82;
    bottomBun.castShadow = true;
    burgerGroup.add(bottomBun);

    // Burger patty
    const patty = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 12)), pattyMat);
    patty.position.y = 1.02;
    burgerGroup.add(patty);

    // Melted cheese slice (rotated 45 deg diamond)
    const cheese = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.2, 0.06, 1.2)), cheeseMat);
    cheese.position.y = 1.14;
    cheese.rotation.y = Math.PI / 4;
    burgerGroup.add(cheese);

    // Crisp lettuce ruffle
    const lettuce = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.98, 0.98, 0.1, 10)), lettuceMat);
    lettuce.position.y = 1.21;
    burgerGroup.add(lettuce);

    // Top seeded bun (dome)
    const topBun = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), bunMat);
    topBun.position.y = 1.26;
    topBun.castShadow = true;
    burgerGroup.add(topBun);

    this.group.add(burgerGroup);
  }

  /**
   * Creates modern curved gooseneck streetlights, Quaternius curb bollards at crossings,
   * roadside utility cabinets, Quaternius stone planters, and decorative pedestrians.
   */
  private buildStreetFurnitureAndPedestrians(): void {
    const { roadWidth } = this.dimensions;
    const halfWidth = roadWidth / 2;

    // 1. Quaternius Curb Bollards (Prop_Bollard.gltf) lining crosswalk corners
    const bollardLocs = [
      // SW corner (along park road edge)
      { x: -halfWidth - 1.2, z: 9.5 },
      { x: -halfWidth - 1.2, z: 13.5 },
      { x: -halfWidth - 1.2, z: 18.0 },
      { x: -9.5, z: halfWidth + 1.2 },
      { x: -13.5, z: halfWidth + 1.2 },
      { x: -18.0, z: halfWidth + 1.2 },
      // SE corner (along diner road edge)
      { x: halfWidth + 1.2, z: 9.5 },
      { x: halfWidth + 1.2, z: 13.5 },
      { x: halfWidth + 1.2, z: 18.0 },
      { x: 9.5, z: halfWidth + 1.2 },
      { x: 13.5, z: halfWidth + 1.2 },
      { x: 18.0, z: halfWidth + 1.2 },
      // NE corner (along skyline road edge)
      { x: halfWidth + 1.2, z: -9.5 },
      { x: halfWidth + 1.2, z: -13.5 },
      { x: halfWidth + 1.2, z: -18.0 },
      { x: 9.5, z: -halfWidth - 1.2 },
      { x: 13.5, z: -halfWidth - 1.2 },
      { x: 18.0, z: -halfWidth - 1.2 },
      // NW corner (along urban road edge)
      { x: -halfWidth - 1.2, z: -9.5 },
      { x: -halfWidth - 1.2, z: -13.5 },
      { x: -halfWidth - 1.2, z: -18.0 },
      { x: -9.5, z: -halfWidth - 1.2 },
      { x: -13.5, z: -halfWidth - 1.2 },
      { x: -18.0, z: -halfWidth - 1.2 }
    ];
    bollardLocs.forEach(b => {
      this.placeGLTF('/models/quaternius/Prop_Bollard.gltf', b.x, 0.22, b.z, 0, 1.0);
    });

    // 2. Quaternius Planters on Pedestrian Plazas
    const plazaPlanters = [
      { x: halfWidth + 2.4, z: 22.0 },
      { x: halfWidth + 2.4, z: 28.0 },
      { x: 22.0, z: halfWidth + 2.4 },
      { x: -halfWidth - 2.4, z: -20.0 },
      { x: -20.0, z: -halfWidth - 2.4 },
      { x: halfWidth + 2.4, z: -20.0 }
    ];
    plazaPlanters.forEach(p => {
      this.placeGLTF('/models/quaternius/Prop_Planter_Single.gltf', p.x, 0.22, p.z, 0, 1.0);
    });

    // 3. Quaternius Linear Sidewalk Planters along avenue pedestrian sidewalks
    const sidewalkPlanters = [
      { x: halfWidth + 3.2, z: -(halfWidth + 12.0), rot: 0 },
      { x: -(halfWidth + 3.2), z: -(halfWidth + 12.0), rot: 0 },
      { x: halfWidth + 3.2, z: halfWidth + 12.0, rot: 0 },
      { x: -(halfWidth + 3.2), z: halfWidth + 12.0, rot: 0 }
    ];
    sidewalkPlanters.forEach(sp => {
      this.placeGLTF('/models/quaternius/Sidewalk_Planter.gltf', sp.x, 0.25, sp.z, sp.rot, 1.0);
    });

    // 2. Curved Gooseneck Streetlights
    const streetlightLocs = [
      { x: -halfWidth - 1.4, z: -12.0, rot: Math.PI / 2 },
      { x: -halfWidth - 1.4, z: 12.0, rot: Math.PI / 2 },
      { x: halfWidth + 1.4, z: -12.0, rot: -Math.PI / 2 },
      { x: halfWidth + 1.4, z: 12.0, rot: -Math.PI / 2 },
      { x: -12.0, z: -halfWidth - 1.4, rot: 0 },
      { x: 12.0, z: -halfWidth - 1.4, rot: 0 },
      { x: -12.0, z: halfWidth + 1.4, rot: Math.PI },
      { x: 12.0, z: halfWidth + 1.4, rot: Math.PI },
      // Further along arms
      { x: -halfWidth - 1.4, z: 34.0, rot: Math.PI / 2 },
      { x: halfWidth + 1.4, z: 34.0, rot: -Math.PI / 2 },
      { x: 34.0, z: -halfWidth - 1.4, rot: 0 }
    ];

    streetlightLocs.forEach(l => this.createStreetlight(l.x, 0.25, l.z, l.rot));

    // 3. Decorative Low-Poly Pedestrians
    // Positioned at sidewalks, bus stops, and zebra crossings matching reference
    const pedestrianLocs = [
      { x: -halfWidth - 2.0, z: -10.0, shirtColor: 0xef4444 }, // Waiting at NW crossing
      { x: -halfWidth - 2.5, z: 10.5, shirtColor: 0x3b82f6 },  // Near SW park corner
      { x: -10.5, z: halfWidth + 2.2, shirtColor: 0xf59e0b },  // Walking on SW sidewalk
      { x: 10.5, z: halfWidth + 2.5, shirtColor: 0x10b981 },   // Near SE diner crossing
      { x: halfWidth + 2.2, z: 10.5, shirtColor: 0xec4899 },   // In front of diner
      { x: halfWidth + 2.0, z: -10.2, shirtColor: 0x8b5cf6 },  // At NE corner
      { x: 10.5, z: -halfWidth - 2.5, shirtColor: 0x06b6d4 },  // Near NE crossing
      { x: halfWidth + 22.0, z: -halfWidth - 2.2, shirtColor: 0xef4444 }, // At bus shelter
      { x: -halfWidth - 18.0, z: halfWidth + 14.0, shirtColor: 0xf97316 }, // Inside park path
      { x: -halfWidth - 26.0, z: halfWidth + 22.0, shirtColor: 0x3b82f6 }  // Inside park path
    ];

    pedestrianLocs.forEach(p => this.createPedestrian(p.x, 0.25, p.z, p.shirtColor));
  }

  // --- REUSABLE PROCEDURAL BUILDINGS & PROPS BUILDERS ---

  /**
   * Multi-story residential or commercial tower block with window grid and optional helipad.
   */
  private createTowerBlock(options: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    facadeColor: number;
    corniceColor: number;
    floors: number;
    hasHelipad?: boolean;
  }): THREE.Group {
    const { x, z, w, d, h, facadeColor, corniceColor, floors, hasHelipad } = options;
    const buildingGroup = new THREE.Group();
    buildingGroup.name = `Building_${Math.round(x)}_${Math.round(z)}`;

    const bMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: facadeColor, roughness: 0.7, flatShading: true })
    );
    const corniceMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: corniceColor, roughness: 0.8, flatShading: true })
    );
    const windowMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8, flatShading: true })
    );

    // Main tower block
    const bGeo = this.trackGeometry(new THREE.BoxGeometry(w, h, d));
    const block = new THREE.Mesh(bGeo, bMat);
    block.position.set(x, 0.25 + h / 2, z);
    block.castShadow = true;
    block.receiveShadow = true;
    buildingGroup.add(block);

    // Roof cornice trim
    const corniceGeo = this.trackGeometry(new THREE.BoxGeometry(w + 0.5, 0.45, d + 0.5));
    const cornice = new THREE.Mesh(corniceGeo, corniceMat);
    cornice.position.set(x, 0.25 + h + 0.225, z);
    cornice.castShadow = true;
    buildingGroup.add(cornice);

    // Rows of rectangular windows
    const winGeo = this.trackGeometry(new THREE.BoxGeometry(1.2, 1.4, 0.1));
    const winGeoSide = this.trackGeometry(new THREE.BoxGeometry(0.1, 1.4, 1.2));
    const floorHeight = h / (floors + 0.5);

    for (let f = 1; f <= floors; f++) {
      const wy = 0.25 + f * floorHeight - 0.4;

      // Front face (towards +Z)
      const numCols = Math.max(2, Math.floor(w / 2.6));
      for (let c = 0; c < numCols; c++) {
        const wx = x - ((numCols - 1) * 2.6) / 2 + c * 2.6;
        const isWarm = (c + f) % 2 === 0;
        const chosenMat = isWarm ? this.warmNightWindowMat : windowMat;
        const win = new THREE.Mesh(winGeo, chosenMat);
        win.position.set(wx, wy, z + d / 2 + 0.05);
        buildingGroup.add(win);
      }

      // Side face (towards -X or +X)
      const numColsSide = Math.max(2, Math.floor(d / 2.6));
      for (let c = 0; c < numColsSide; c++) {
        const wz = z - ((numColsSide - 1) * 2.6) / 2 + c * 2.6;
        const isWarmSide = (c + f) % 3 === 0;
        const chosenMatSide = isWarmSide ? this.warmNightWindowMat : windowMat;
        const winSide = new THREE.Mesh(winGeoSide, chosenMatSide);
        winSide.position.set(x - w / 2 - 0.05, wy, wz);
        buildingGroup.add(winSide);
      }
    }

    // Optional Helipad & Miniature Red Helicopter on top (for the Orange Tower!)
    if (hasHelipad) {
      this.createHelipadWithHelicopter(x, 0.25 + h + 0.45, z);
    }

    this.group.add(buildingGroup);
    return buildingGroup;
  }

  /**
   * Replaces a procedural placeholder building with an asynchronous GLTF asset once loaded.
   * If loading fails or running in headless/Node test environments, the procedural placeholder remains visible.
   */
  private replaceWithGLTF(
    placeholder: THREE.Group,
    modelUrl: string,
    posX: number,
    posY: number,
    posZ: number,
    rotY: number = 0,
    scale: number = 1.0
  ): void {
    if (typeof window === 'undefined') return;

    ModelLoader.loadModel(modelUrl)
      .then(loadedModel => {
        if (!loadedModel || this.isDisposed) return;

        loadedModel.position.set(posX, posY, posZ);
        loadedModel.rotation.y = rotY;
        loadedModel.scale.set(scale, scale, scale);

        // Safely configure window materials for warm night lighting
        this.configureImportedBuildingWindows(loadedModel, posX, posZ);

        // Hide and remove placeholder
        this.group.remove(placeholder);
        placeholder.visible = false;

        // Add loaded model
        this.group.add(loadedModel);
        this.loadedModelGroups.push(loadedModel);
      })
      .catch(err => {
        console.warn(`[RoadRenderer] Failed to replace placeholder with ${modelUrl}:`, err);
      });
  }

  /**
   * Places an asynchronous GLTF asset directly in the scene or under a parent group.
   * In headless/Node test environments, fails gracefully without throwing.
   */
  private placeGLTF(
    modelUrl: string,
    posX: number,
    posY: number,
    posZ: number,
    rotY: number = 0,
    scale: number = 1.0,
    parent?: THREE.Group,
    options?: { castShadow?: boolean; receiveShadow?: boolean }
  ): void {
    if (typeof window === 'undefined') return;

    ModelLoader.loadModel(modelUrl, options)
      .then(loadedModel => {
        if (!loadedModel || this.isDisposed) return;

        loadedModel.position.set(posX, posY, posZ);
        loadedModel.rotation.y = rotY;
        loadedModel.scale.set(scale, scale, scale);

        // Safely configure window materials for warm night lighting if applicable
        this.configureImportedBuildingWindows(loadedModel, posX, posZ);

        const target = parent || this.group;
        target.add(loadedModel);
        this.loadedModelGroups.push(loadedModel);
      })
      .catch(err => {
        console.warn(`[RoadRenderer] Failed to place GLTF ${modelUrl}:`, err);
      });
  }

  /**
   * Selectively identifies, clones, and isolates window and fake-interior materials
   * on loaded Quaternius building assets to enable organic, warm nocturnal window lighting
   * with natural building-to-building variance without mutating shared templates or unrelated assets.
   */
  public configureImportedBuildingWindows(model: THREE.Group, posX: number, posZ: number): void {
    if ((model as any)._windowsConfigured) return;
    (model as any)._windowsConfigured = true;

    let roomIdx = 0;

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!mesh.material) return;

        const processMaterial = (mat: THREE.Material): THREE.Material => {
          const matName = mat.name || '';
          const isFakeInterior = /fakeinterior/i.test(matName);
          const isGlass = /glass/i.test(matName);

          if (!isFakeInterior && !isGlass) {
            return mat;
          }

          // Clone material to ensure isolated building state and prevent cross-building mutation
          const stdMat = mat as THREE.MeshStandardMaterial;
          const clonedMat = this.trackMaterial(stdMat.clone());
          roomIdx++;

          if (isFakeInterior) {
            // Preserve the original interior room diffuse map (desks, curtains, lamps)
            if (clonedMat.map) {
              clonedMat.emissiveMap = clonedMat.map;
            }
            clonedMat.emissive = new THREE.Color(0xffcf87); // Warm amber incandescent room glow

            // Deterministic hash based on building coordinates and room index for natural variation
            const hash = Math.abs(Math.sin(posX * 12.9898 + posZ * 78.233 + roomIdx * 37.719));
            let maxIntensity = 1.6;

            if (hash < 0.28) {
              // 28% of rooms are dark / unoccupied (natural nighttime variance)
              maxIntensity = 0.05;
            } else if (hash < 0.62) {
              // 34% of rooms are softly illuminated
              maxIntensity = 1.1;
            } else {
              // 38% of rooms are brightly illuminated
              maxIntensity = 1.85;
            }

            clonedMat.emissiveIntensity = maxIntensity * this.currentNightProgress;
            this.importedWindowMaterials.push({ material: clonedMat, maxIntensity });
          } else if (isGlass) {
            // Semi-transparent window pane subtle night glaze
            clonedMat.emissive = new THREE.Color(0xffe4a0);
            const maxIntensity = 0.22;
            clonedMat.emissiveIntensity = maxIntensity * this.currentNightProgress;
            this.importedWindowMaterials.push({ material: clonedMat, maxIntensity });
          }

          return clonedMat;
        };

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(m => processMaterial(m));
        } else {
          mesh.material = processMaterial(mesh.material);
        }
      }
    });
  }

  /**
   * Creates a classic stylized rooftop wooden water tank on a four-legged steel stilt tower.
   */
  private createRooftopWaterTower(x: number, y: number, z: number): THREE.Group {
    const towerGroup = new THREE.Group();
    towerGroup.position.set(x, y, z);

    const woodMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85, flatShading: true })
    );
    const bandMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 })
    );
    const steelMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.4 })
    );
    const roofMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8, flatShading: true })
    );

    // 4 Steel stilt legs
    const legGeo = this.trackGeometry(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6));
    const legRadius = 0.9;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const leg = new THREE.Mesh(legGeo, steelMat);
      leg.position.set(Math.cos(angle) * legRadius, 1.1, Math.sin(angle) * legRadius);
      leg.castShadow = true;
      towerGroup.add(leg);
    }

    // Steel cross platform
    const platformGeo = this.trackGeometry(new THREE.BoxGeometry(2.2, 0.1, 2.2));
    const platform = new THREE.Mesh(platformGeo, steelMat);
    platform.position.y = 2.25;
    platform.castShadow = true;
    towerGroup.add(platform);

    // Wooden stave barrel tank
    const tankGeo = this.trackGeometry(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 12));
    const tank = new THREE.Mesh(tankGeo, woodMat);
    tank.position.y = 3.2;
    tank.castShadow = true;
    towerGroup.add(tank);

    // Metal barrel hoop rings
    const ringGeo = this.trackGeometry(new THREE.TorusGeometry(1.02, 0.03, 4, 16));
    [2.6, 3.2, 3.8].forEach(ry => {
      const ring = new THREE.Mesh(ringGeo, bandMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      towerGroup.add(ring);
    });

    // Conical roof cap
    const coneGeo = this.trackGeometry(new THREE.ConeGeometry(1.15, 0.9, 12));
    const cone = new THREE.Mesh(coneGeo, roofMat);
    cone.position.y = 4.55;
    cone.castShadow = true;
    towerGroup.add(cone);

    this.group.add(towerGroup);
    return towerGroup;
  }

  /**
   * Creates an elevator penthouse / roof stair access cabin.
   */
  private createRooftopBulkhead(
    x: number,
    y: number,
    z: number,
    w: number = 3.0,
    h: number = 2.4,
    d: number = 2.6
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const wallMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, flatShading: true })
    );
    const doorMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 })
    );

    const bodyGeo = this.trackGeometry(new THREE.BoxGeometry(w, h, d));
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Metal door
    const doorGeo = this.trackGeometry(new THREE.BoxGeometry(0.8, 1.7, 0.08));
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.85, d / 2 + 0.04);
    group.add(door);

    this.group.add(group);
    return group;
  }

  /**
   * Creates a commercial HVAC ventilation duct with mushroom cowl cap.
   */
  private createRooftopVentPipe(x: number, y: number, z: number): THREE.Group {
    const ventGroup = new THREE.Group();
    ventGroup.position.set(x, y, z);

    const ductMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.3 })
    );

    // Vertical pipe
    const pipeGeo = this.trackGeometry(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 8));
    const pipe = new THREE.Mesh(pipeGeo, ductMat);
    pipe.position.y = 0.55;
    pipe.castShadow = true;
    ventGroup.add(pipe);

    // Mushroom cowl hood
    const hoodGeo = this.trackGeometry(new THREE.ConeGeometry(0.45, 0.25, 8));
    const hood = new THREE.Mesh(hoodGeo, ductMat);
    hood.position.y = 1.2;
    hood.castShadow = true;
    ventGroup.add(hood);

    this.group.add(ventGroup);
    return ventGroup;
  }

  /**
   * Assembled Quaternius Boutique Townhouse (replacing the plain white building).
   * Features:
   * - Genuine Quaternius Entrance_Concrete_2x1 with Door_1.
   * - Multi-tier warm terracotta brick facade with carved window frames and stone lintels.
   * - Fully aligned and closed 4-sided roof parapet with stone cornices and gravel inlay.
   * - Rooftop mechanical AC unit.
   * - Zero mismatched, broken, or protruding roof pieces.
   */
  private createAssembledTownhouse(x: number, z: number, rotY: number = 0): THREE.Group {
    const townhouseGroup = new THREE.Group();
    townhouseGroup.position.set(x, 0.25, z);
    townhouseGroup.rotation.y = rotY;

    const bw = 6.4;
    const bd = 6.4;
    const bh = 6.5;

    // High quality materials
    const brickMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.72, flatShading: true }) // Warm terracotta red brick
    );
    const stonePlinthMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, flatShading: true })
    );
    const trimMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, flatShading: true })
    );
    const winMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.85 })
    );

    // 1. Foundation Plinth
    const plinthH = 0.5;
    const plinth = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(bw + 0.2, plinthH, bd + 0.2)), stonePlinthMat);
    plinth.position.y = plinthH / 2;
    plinth.receiveShadow = true;
    townhouseGroup.add(plinth);

    // 2. Main Masonry Body
    const bodyH = bh - plinthH;
    const body = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(bw, bodyH, bd)), brickMat);
    body.position.y = plinthH + bodyH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    townhouseGroup.add(body);

    // 3. Ground Floor Storefront Glass & Windows
    const storeWinGeo = this.trackGeometry(new THREE.BoxGeometry(1.8, 1.8, 0.12));
    const storeWinL = new THREE.Mesh(storeWinGeo, winMat);
    storeWinL.position.set(-1.8, plinthH + 1.2, bd / 2 + 0.05);
    townhouseGroup.add(storeWinL);

    const storeWinR = new THREE.Mesh(storeWinGeo, winMat);
    storeWinR.position.set(1.8, plinthH + 1.2, bd / 2 + 0.05);
    townhouseGroup.add(storeWinR);

    // Stone sills and headers for storefront
    const sillGeo = this.trackGeometry(new THREE.BoxGeometry(2.0, 0.12, 0.2));
    [-1.8, 1.8].forEach(wx => {
      const sill = new THREE.Mesh(sillGeo, trimMat);
      sill.position.set(wx, plinthH + 0.25, bd / 2 + 0.08);
      townhouseGroup.add(sill);

      const header = new THREE.Mesh(sillGeo, trimMat);
      header.position.set(wx, plinthH + 2.15, bd / 2 + 0.08);
      townhouseGroup.add(header);
    });

    // Decorative ground floor canopy / awning
    const awningGeo = this.trackGeometry(new THREE.BoxGeometry(bw * 0.9, 0.25, 1.3));
    const awningMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5, flatShading: true })
    );
    const awning = new THREE.Mesh(awningGeo, awningMat);
    awning.position.set(0, plinthH + 2.4, bd / 2 + 0.65);
    awning.rotation.x = 0.2;
    awning.castShadow = true;
    townhouseGroup.add(awning);

    // 4. Upper Floor Windows with white stone headers and sills
    const upperWinGeo = this.trackGeometry(new THREE.BoxGeometry(1.2, 1.4, 0.12));
    [-1.8, 0, 1.8].forEach(wx => {
      const uwin = new THREE.Mesh(upperWinGeo, winMat);
      uwin.position.set(wx, plinthH + 4.2, bd / 2 + 0.05);
      townhouseGroup.add(uwin);

      const usill = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.4, 0.1, 0.18)), trimMat);
      usill.position.set(wx, plinthH + 3.45, bd / 2 + 0.08);
      townhouseGroup.add(usill);

      const uhead = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.4, 0.14, 0.18)), trimMat);
      uhead.position.set(wx, plinthH + 4.95, bd / 2 + 0.08);
      townhouseGroup.add(uhead);
    });

    // 5. Complete, Finished 4-Sided Roof Parapet (Zero broken/protruding pieces!)
    const parapetGeo = this.trackGeometry(new THREE.BoxGeometry(bw + 0.35, 0.45, bd + 0.35));
    const parapet = new THREE.Mesh(parapetGeo, trimMat);
    parapet.position.y = bh + 0.22;
    parapet.castShadow = true;
    townhouseGroup.add(parapet);

    // Recessed flat gravel roof deck:
    const roofDeckGeo = this.trackGeometry(new THREE.BoxGeometry(bw - 0.4, 0.1, bd - 0.4));
    const roofMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
    );
    const roofDeck = new THREE.Mesh(roofDeckGeo, roofMat);
    roofDeck.position.y = bh + 0.35;
    roofDeck.receiveShadow = true;
    townhouseGroup.add(roofDeck);

    this.group.add(townhouseGroup);

    // Asynchronously attach Quaternius entrance and rooftop AC unit
    if (typeof window !== 'undefined') {
      // Front entrance door
      this.placeGLTF(
        '/models/quaternius/Entrance_Concrete_2x1.gltf',
        0,
        0,
        bd / 2 + 0.05,
        0,
        1.0,
        townhouseGroup
      );
      this.placeGLTF(
        '/models/quaternius/Door_1.gltf',
        0.5,
        0,
        bd / 2 + 0.05,
        0,
        1.0,
        townhouseGroup
      );
      // Rooftop AC unit sitting solidly on the finished roof deck
      this.placeGLTF(
        '/models/quaternius/Prop_ACUnit.gltf',
        -1.2,
        bh + 0.35,
        -1.0,
        0,
        1.0,
        townhouseGroup
      );
    }

    return townhouseGroup;
  }



  /**
   * Rooftop Helipad with a miniature decorative red low-poly helicopter (matching reference).
   */
  private createHelipadWithHelicopter(x: number, y: number, z: number): void {
    const helipadMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
    );
    const circleMarkingMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    const redChopperMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, flatShading: true })
    );
    const blackMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.6 })
    );

    // Circular helipad platform
    const pad = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(4.2, 4.2, 0.15, 16)), helipadMat);
    pad.position.set(x, y + 0.08, z);
    pad.receiveShadow = true;
    this.group.add(pad);

    // White circle marking ring
    const ring = new THREE.Mesh(this.trackGeometry(new THREE.RingGeometry(3.2, 3.6, 16)), circleMarkingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.17, z);
    this.group.add(ring);

    // Helicopter assembly
    const heliGroup = new THREE.Group();
    heliGroup.position.set(x, y + 0.18, z);
    heliGroup.rotation.y = Math.PI / 4;

    // Skids
    const skidGeo = this.trackGeometry(new THREE.BoxGeometry(0.08, 0.06, 2.4));
    [-0.55, 0.55].forEach(sx => {
      const skid = new THREE.Mesh(skidGeo, blackMat);
      skid.position.set(sx, 0.08, 0);
      heliGroup.add(skid);

      const legGeo = this.trackGeometry(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4));
      [-0.6, 0.6].forEach(lz => {
        const leg = new THREE.Mesh(legGeo, blackMat);
        leg.position.set(sx, 0.2, lz);
        heliGroup.add(leg);
      });
    });

    // Fuselage
    const fuselageGeo = this.trackGeometry(new THREE.BoxGeometry(1.2, 0.9, 2.2));
    const fuselage = new THREE.Mesh(fuselageGeo, redChopperMat);
    fuselage.position.set(0, 0.75, 0);
    fuselage.castShadow = true;
    heliGroup.add(fuselage);

    // Cockpit windshield
    const cockpitGeo = this.trackGeometry(new THREE.BoxGeometry(1.0, 0.6, 0.6));
    const cockpit = new THREE.Mesh(cockpitGeo, blackMat);
    cockpit.position.set(0, 0.8, 0.9);
    heliGroup.add(cockpit);

    // Tail boom
    const tailGeo = this.trackGeometry(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6));
    const tail = new THREE.Mesh(tailGeo, redChopperMat);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.85, -1.8);
    heliGroup.add(tail);

    // Main rotor shaft & blades
    const rotorShaft = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 6)), blackMat);
    rotorShaft.position.set(0, 1.35, 0.1);
    heliGroup.add(rotorShaft);

    const bladeGeo = this.trackGeometry(new THREE.BoxGeometry(4.2, 0.04, 0.25));
    const blades = new THREE.Mesh(bladeGeo, blackMat);
    blades.position.set(0, 1.52, 0.1);
    heliGroup.add(blades);

    this.group.add(heliGroup);
  }


  /**
   * Blue Bus Stop Shelter (matching reference).
   * Transparent blue curved glass roof on dark frame with bench inside.
   */
  private createBusShelter(x: number, y: number, z: number, rotY: number): void {
    const shelterGroup = new THREE.Group();
    shelterGroup.position.set(x, y, z);
    shelterGroup.rotation.y = rotY;

    const frameMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 }));
    const glassMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.75,
        roughness: 0.2
      })
    );
    const benchWoodMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 }));

    // Back wall glass
    const backGeo = this.trackGeometry(new THREE.BoxGeometry(3.6, 2.2, 0.1));
    const back = new THREE.Mesh(backGeo, glassMat);
    back.position.set(0, 1.1, -0.6);
    shelterGroup.add(back);

    // Curved/Angled blue roof canopy
    const roofGeo = this.trackGeometry(new THREE.BoxGeometry(4.0, 0.12, 1.6));
    const roof = new THREE.Mesh(roofGeo, glassMat);
    roof.position.set(0, 2.25, 0.05);
    roof.castShadow = true;
    shelterGroup.add(roof);

    // Metal support posts
    const postGeo = this.trackGeometry(new THREE.CylinderGeometry(0.06, 0.06, 2.25, 6));
    [-1.8, 1.8].forEach(px => {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(px, 1.125, -0.6);
      post.castShadow = true;
      shelterGroup.add(post);
    });

    // Interior bench
    const benchGeo = this.trackGeometry(new THREE.BoxGeometry(2.6, 0.08, 0.45));
    const bench = new THREE.Mesh(benchGeo, benchWoodMat);
    bench.position.set(0, 0.45, -0.4);
    shelterGroup.add(bench);

    this.group.add(shelterGroup);
  }

  /**
   * Sidewalk advertising billboard on metal frame (matching reference).
   */
  private createBillboard(x: number, y: number, z: number, rotY: number): void {
    const bbGroup = new THREE.Group();
    bbGroup.position.set(x, y, z);
    bbGroup.rotation.y = rotY;

    const frameMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 }));
    const boardMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));

    // Metal legs
    const legGeo = this.trackGeometry(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6));
    [-1.2, 1.2].forEach(lx => {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, 0.9, 0);
      leg.castShadow = true;
      bbGroup.add(leg);
    });

    // Poster board panel
    const boardGeo = this.trackGeometry(new THREE.BoxGeometry(3.0, 1.6, 0.12));
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 2.1, 0);
    board.castShadow = true;
    bbGroup.add(board);

    this.group.add(bbGroup);
  }

  /**
   * Sidewalk vending machine (matching red/amber machines outside park in reference).
   */
  private createVendingMachine(x: number, y: number, z: number, rotY: number, colorHex: number): void {
    const vmGroup = new THREE.Group();
    vmGroup.position.set(x, y, z);
    vmGroup.rotation.y = rotY;

    const bodyMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, flatShading: true }));
    const glassMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x38bdf8, emissiveIntensity: 0.4 }));

    const body = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.9, 1.8, 0.7)), bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    vmGroup.add(body);

    const display = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.7, 0.9, 0.05)), glassMat);
    display.position.set(0, 1.15, 0.36);
    vmGroup.add(display);

    this.group.add(vmGroup);
  }

  /**
   * Green roadside electrical utility cabinet (matching reference).
   */
  private createElectricalKiosk(x: number, y: number, z: number, rotY: number): void {
    const kGroup = new THREE.Group();
    kGroup.position.set(x, y, z);
    kGroup.rotation.y = rotY;

    const greenMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6, flatShading: true }));
    const kBox = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.2, 1.4, 0.9)), greenMat);
    kBox.position.y = 0.7;
    kBox.castShadow = true;
    kGroup.add(kBox);

    this.group.add(kGroup);
  }

  /**
   * Red street ticket/newspaper kiosk (matching reference).
   */
  private createKiosk(x: number, y: number, z: number, rotY: number, col: number): void {
    const kGroup = new THREE.Group();
    kGroup.position.set(x, y, z);
    kGroup.rotation.y = rotY;

    const kMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, flatShading: true }));
    const roofMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }));

    const body = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.6, 2.2, 1.4)), kMat);
    body.position.y = 1.1;
    body.castShadow = true;
    kGroup.add(body);

    const roof = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(1.9, 0.25, 1.7)), roofMat);
    roof.position.y = 2.25;
    kGroup.add(roof);

    this.group.add(kGroup);
  }

  /**
   * Bicycle rack with low-poly bikes outside the diner.
   */
  private createBicycleRack(x: number, y: number, z: number, rotY: number): void {
    const rackGroup = new THREE.Group();
    rackGroup.position.set(x, y, z);
    rackGroup.rotation.y = rotY;

    const metalMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 }));
    const bikeColors = [0x3b82f6, 0xef4444, 0x10b981];

    // Rack frame loops
    for (let i = 0; i < 4; i++) {
      const loop = new THREE.Mesh(this.trackGeometry(new THREE.TorusGeometry(0.35, 0.04, 6, 8, Math.PI)), metalMat);
      loop.position.set(-1.2 + i * 0.8, 0.35, 0);
      loop.rotation.z = Math.PI;
      rackGroup.add(loop);

      // Low-poly bicycle parked in slot
      if (i < 3) {
        const bikeMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: bikeColors[i], flatShading: true }));
        const wheelGeo = this.trackGeometry(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 8));
        const wheelL = new THREE.Mesh(wheelGeo, metalMat);
        wheelL.rotation.z = Math.PI / 2;
        wheelL.position.set(-1.2 + i * 0.8, 0.28, 0.4);
        rackGroup.add(wheelL);

        const wheelR = new THREE.Mesh(wheelGeo, metalMat);
        wheelR.rotation.z = Math.PI / 2;
        wheelR.position.set(-1.2 + i * 0.8, 0.28, -0.4);
        rackGroup.add(wheelR);

        const frame = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.08, 0.35, 0.7)), bikeMat);
        frame.position.set(-1.2 + i * 0.8, 0.45, 0);
        rackGroup.add(frame);
      }
    }

    this.group.add(rackGroup);
  }

  /**
   * Picket-fenced side yard with tree behind the diner.
   */
  private createFencedYardWithTree(x: number, y: number, z: number): void {
    const yardGroup = new THREE.Group();
    yardGroup.position.set(x, y, z);

    const fenceMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 }));
    const grassMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.9 }));

    const lawn = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(8, 0.12, 8)), grassMat);
    lawn.position.y = 0.06;
    yardGroup.add(lawn);

    // Fence rails
    const railH = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(8, 0.7, 0.08)), fenceMat);
    railH.position.set(0, 0.45, 4.0);
    yardGroup.add(railH);

    const railV = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.08, 0.7, 8)), fenceMat);
    railV.position.set(4.0, 0.45, 0);
    yardGroup.add(railV);

    // Tree in yard
    this.createTree(x, y + 0.12, z, 'deciduous', 1.05, 0x16a34a);

    this.group.add(yardGroup);
  }

  /**
   * Park / Sidewalk bench.
   */
  private createBench(x: number, y: number, z: number, rotY: number): void {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(x, y, z);
    benchGroup.rotation.y = rotY;

    const woodMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 }));
    const metalMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 }));

    const seat = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(2.0, 0.08, 0.55)), woodMat);
    seat.position.set(0, 0.42, 0);
    seat.castShadow = true;
    benchGroup.add(seat);

    const back = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(2.0, 0.45, 0.08)), woodMat);
    back.position.set(0, 0.72, -0.24);
    back.castShadow = true;
    benchGroup.add(back);

    [-0.8, 0.8].forEach(lx => {
      const leg = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.08, 0.42, 0.5)), metalMat);
      leg.position.set(lx, 0.21, 0);
      leg.castShadow = true;
      benchGroup.add(leg);
    });

    this.group.add(benchGroup);
  }

  /**
   * Modern curved gooseneck streetlight matching reference.
   */
  private createStreetlight(x: number, y: number, z: number, rotY: number): void {
    const lightGroup = new THREE.Group();
    lightGroup.position.set(x, y, z);
    lightGroup.rotation.y = rotY;

    const poleMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 }));

    // Vertical post
    const pole = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.1, 0.14, 5.4, 8)), poleMat);
    pole.position.y = 2.7;
    pole.castShadow = true;
    lightGroup.add(pole);

    // Curved arm
    const arm = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6)), poleMat);
    arm.rotation.z = Math.PI / 2.7;
    arm.position.set(0.75, 5.2, 0);
    lightGroup.add(arm);

    // Sleek lamp fixture with dark metallic canopy and downward luminous lens
    const canopyMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.8 })
    );
    const canopy = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.48, 0.08, 0.60)), canopyMat);
    canopy.position.set(1.4, 5.56, 0);
    canopy.castShadow = true;
    lightGroup.add(canopy);

    const lamp = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.38, 0.06, 0.50)), this.streetlightBulbMat);
    lamp.position.set(1.4, 5.49, 0);
    lightGroup.add(lamp);

    // Feathered, translucent ground light pool beneath lantern (soft radial falloff, zero hard rings)
    const poolGeo = this.trackGeometry(new THREE.PlaneGeometry(7.2, 7.2));
    const pool = new THREE.Mesh(poolGeo, this.streetLightPoolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(1.4, 0.016, 0);
    lightGroup.add(pool);

    this.group.add(lightGroup);
  }

  /**
   * Decorative stylized low-poly pedestrian figurine.
   */
  private createPedestrian(x: number, y: number, z: number, shirtColorHex: number): void {
    const ped = new THREE.Group();
    ped.position.set(x, y, z);

    const pantsMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
    const shirtMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: shirtColorHex, roughness: 0.6, flatShading: true }));
    const skinMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.7 }));

    // Legs
    const legs = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.32, 0.75, 0.2)), pantsMat);
    legs.position.y = 0.375;
    ped.add(legs);

    // Torso / Shirt
    const torso = new THREE.Mesh(this.trackGeometry(new THREE.BoxGeometry(0.38, 0.6, 0.24)), shirtMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    ped.add(torso);

    // Head
    const head = new THREE.Mesh(this.trackGeometry(new THREE.SphereGeometry(0.18, 6, 6)), skinMat);
    head.position.y = 1.5;
    head.castShadow = true;
    ped.add(head);

    this.group.add(ped);
  }

  /**
   * Reusable low-poly geometric tree builder matching reference:
   * - 'pine': Stepped conical tiers with rich forest/emerald green.
   * - 'deciduous': Low-poly faceted dodecahedron/icosahedron crowns.
   */
  private createTree(
    x: number,
    y: number,
    z: number,
    type: 'pine' | 'deciduous' = 'deciduous',
    scale: number = 1.0,
    colorHex: number = 0x15803d
  ): THREE.Group {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);
    treeGroup.scale.set(scale, scale, scale);

    const trunkMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9, flatShading: true }));
    const folMat = this.trackMaterial(new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.85, flatShading: true }));

    // Trunk
    const trunk = new THREE.Mesh(this.trackGeometry(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6)), trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    if (type === 'pine') {
      // 3 Stepped Conical Tiers (matching reference pines)
      const bCone = new THREE.Mesh(this.trackGeometry(new THREE.ConeGeometry(2.1, 2.2, 7)), folMat);
      bCone.position.y = 2.4;
      bCone.castShadow = true;
      treeGroup.add(bCone);

      const mCone = new THREE.Mesh(this.trackGeometry(new THREE.ConeGeometry(1.6, 1.9, 7)), folMat);
      mCone.position.y = 3.6;
      mCone.castShadow = true;
      treeGroup.add(mCone);

      const tCone = new THREE.Mesh(this.trackGeometry(new THREE.ConeGeometry(1.1, 1.7, 7)), folMat);
      tCone.position.y = 4.6;
      tCone.castShadow = true;
      treeGroup.add(tCone);
    } else {
      // Faceted broadleaf crown (matching reference rounded trees)
      const crown = new THREE.Mesh(this.trackGeometry(new THREE.DodecahedronGeometry(1.8, 1)), folMat);
      crown.position.set(0, 3.1, 0);
      crown.castShadow = true;
      treeGroup.add(crown);

      const subCrown = new THREE.Mesh(this.trackGeometry(new THREE.DodecahedronGeometry(1.1, 0)), folMat);
      subCrown.position.set(0.6, 3.6, 0.3);
      subCrown.castShadow = true;
      treeGroup.add(subCrown);
    }

    this.group.add(treeGroup);
    return treeGroup;
  }

  /**
   * Complete memory cleanup for all tracked geometries, materials, and children.
   */
  public dispose(): void {
    this.isDisposed = true;
    this.geometries.forEach(geo => geo.dispose());
    this.materials.forEach(mat => mat.dispose());
    this.geometries = [];
    this.materials = [];
    this.loadedModelGroups.forEach(model => {
      model.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
    });
    this.streetLightPoolTexture?.dispose();
    this.streetLightPoolTexture = null;
    this.importedWindowMaterials = [];
    this.loadedModelGroups = [];
    this.group.clear();
    ModelLoader.clearCache();
  }
}
