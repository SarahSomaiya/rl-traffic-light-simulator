import * as THREE from 'three';

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
 * Procedural road network, markings, sidewalks, and decorative environment renderer.
 */
export class RoadRenderer {
  private group: THREE.Group;
  private dimensions: RoadDimensions;
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  constructor(dimensions: RoadDimensions = DEFAULT_ROAD_DIMENSIONS) {
    this.dimensions = dimensions;
    this.group = new THREE.Group();
    this.group.name = 'RoadEnvironment';

    this.buildGround();
    this.buildRoads();
    this.buildMarkings();
    this.buildSidewalks();
    this.buildScenery();
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
   * Surrounding terrain/grass ground plane.
   */
  private buildGround(): void {
    const groundGeo = this.trackGeometry(new THREE.PlaneGeometry(300, 300));
    const groundMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1e3a24,
        roughness: 0.95,
        metalness: 0.05
      })
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    ground.name = 'GroundTerrain';
    this.group.add(ground);
  }

  /**
   * Asphalt intersection center and intersecting road arms.
   */
  private buildRoads(): void {
    const { roadWidth, roadLength } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const armLength = roadLength - halfWidth;

    const asphaltMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x22262c,
        roughness: 0.85,
        metalness: 0.12
      })
    );

    // Center intersection junction
    const centerGeo = this.trackGeometry(new THREE.PlaneGeometry(roadWidth, roadWidth));
    const centerMesh = new THREE.Mesh(centerGeo, asphaltMat);
    centerMesh.rotation.x = -Math.PI / 2;
    centerMesh.receiveShadow = true;
    centerMesh.name = 'IntersectionCenter';
    this.group.add(centerMesh);

    // North & South roads (along Z)
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

    // East & West roads (along X)
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
   * Road markings: center yellow dividers, white lane dashes, solid edge lines, stop lines, crosswalks.
   */
  private buildMarkings(): void {
    const { roadWidth, roadLength, stopLineOffset, crosswalkStartOffset, crosswalkEndOffset } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const armLength = roadLength - halfWidth;
    const yMarking = 0.02; // Elevated slightly to prevent z-fighting

    const yellowMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.6,
        metalness: 0.1
      })
    );

    const whiteMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.5,
        metalness: 0.1
      })
    );

    // 1. Center Double Yellow Lines on all 4 arms
    const yellowLineWidth = 0.22;
    const yellowGap = 0.25;

    // North & South center yellow
    const yellowNSGeo = this.trackGeometry(new THREE.PlaneGeometry(yellowLineWidth, armLength - 4));
    [-yellowGap, yellowGap].forEach(offset => {
      const nLine = new THREE.Mesh(yellowNSGeo, yellowMat);
      nLine.rotation.x = -Math.PI / 2;
      nLine.position.set(offset, yMarking, -(halfWidth + 2 + (armLength - 4) / 2));
      this.group.add(nLine);

      const sLine = new THREE.Mesh(yellowNSGeo, yellowMat);
      sLine.rotation.x = -Math.PI / 2;
      sLine.position.set(offset, yMarking, halfWidth + 2 + (armLength - 4) / 2);
      this.group.add(sLine);
    });

    // East & West center yellow
    const yellowEWGeo = this.trackGeometry(new THREE.PlaneGeometry(armLength - 4, yellowLineWidth));
    [-yellowGap, yellowGap].forEach(offset => {
      const eLine = new THREE.Mesh(yellowEWGeo, yellowMat);
      eLine.rotation.x = -Math.PI / 2;
      eLine.position.set(halfWidth + 2 + (armLength - 4) / 2, yMarking, offset);
      this.group.add(eLine);

      const wLine = new THREE.Mesh(yellowEWGeo, yellowMat);
      wLine.rotation.x = -Math.PI / 2;
      wLine.position.set(-(halfWidth + 2 + (armLength - 4) / 2), yMarking, offset);
      this.group.add(wLine);
    });

    // 2. Dashed White Lane Dividers (4 units from center on each side)
    const dashLength = 3.0;
    const dashGap = 3.0;
    const dashWidth = 0.22;
    const dashGeo = this.trackGeometry(new THREE.PlaneGeometry(dashWidth, dashLength));
    const dashGeoH = this.trackGeometry(new THREE.PlaneGeometry(dashLength, dashWidth));

    const totalDashes = Math.floor((armLength - 8) / (dashLength + dashGap));
    for (let i = 0; i < totalDashes; i++) {
      const dist = halfWidth + 4 + i * (dashLength + dashGap) + dashLength / 2;

      // North/South lanes
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

      // East/West lanes
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

    // 3. Stop Lines (Solid white bar across incoming traffic)
    // Note: Incoming lanes are on right-hand side in standard driving
    const stopLineWidth = halfWidth - 0.5; // spans the incoming half
    const stopLineDepth = 0.8;
    const stopLineGeoV = this.trackGeometry(new THREE.PlaneGeometry(stopLineWidth, stopLineDepth));
    const stopLineGeoH = this.trackGeometry(new THREE.PlaneGeometry(stopLineDepth, stopLineWidth));

    // North incoming (traveling South, on West side x < 0)
    const stopN = new THREE.Mesh(stopLineGeoV, whiteMat);
    stopN.rotation.x = -Math.PI / 2;
    stopN.position.set(-stopLineWidth / 2 - 0.25, yMarking, -stopLineOffset);
    this.group.add(stopN);

    // South incoming (traveling North, on East side x > 0)
    const stopS = new THREE.Mesh(stopLineGeoV, whiteMat);
    stopS.rotation.x = -Math.PI / 2;
    stopS.position.set(stopLineWidth / 2 + 0.25, yMarking, stopLineOffset);
    this.group.add(stopS);

    // East incoming (traveling West, on North side z < 0)
    const stopE = new THREE.Mesh(stopLineGeoH, whiteMat);
    stopE.rotation.x = -Math.PI / 2;
    stopE.position.set(stopLineOffset, yMarking, -stopLineWidth / 2 - 0.25);
    this.group.add(stopE);

    // West incoming (traveling East, on South side z > 0)
    const stopW = new THREE.Mesh(stopLineGeoH, whiteMat);
    stopW.rotation.x = -Math.PI / 2;
    stopW.position.set(-stopLineOffset, yMarking, stopLineWidth / 2 + 0.25);
    this.group.add(stopW);

    // 4. Pedestrian Crosswalks (Zebra stripes on each arm)
    const zebraLength = crosswalkEndOffset - crosswalkStartOffset;
    const zebraStripeWidth = 0.7;
    const zebraSpacing = 1.25;
    const zebraCenterDist = (crosswalkStartOffset + crosswalkEndOffset) / 2;

    const stripeGeoV = this.trackGeometry(new THREE.PlaneGeometry(zebraStripeWidth, zebraLength));
    const stripeGeoH = this.trackGeometry(new THREE.PlaneGeometry(zebraLength, zebraStripeWidth));

    const numStripes = Math.floor((roadWidth - 1.5) / zebraSpacing);
    const startOffset = -((numStripes - 1) * zebraSpacing) / 2;

    for (let s = 0; s < numStripes; s++) {
      const pos = startOffset + s * zebraSpacing;

      // North crosswalk
      const zN = new THREE.Mesh(stripeGeoV, whiteMat);
      zN.rotation.x = -Math.PI / 2;
      zN.position.set(pos, yMarking, -zebraCenterDist);
      this.group.add(zN);

      // South crosswalk
      const zS = new THREE.Mesh(stripeGeoV, whiteMat);
      zS.rotation.x = -Math.PI / 2;
      zS.position.set(pos, yMarking, zebraCenterDist);
      this.group.add(zS);

      // East crosswalk
      const zE = new THREE.Mesh(stripeGeoH, whiteMat);
      zE.rotation.x = -Math.PI / 2;
      zE.position.set(zebraCenterDist, yMarking, pos);
      this.group.add(zE);

      // West crosswalk
      const zW = new THREE.Mesh(stripeGeoH, whiteMat);
      zW.rotation.x = -Math.PI / 2;
      zW.position.set(-zebraCenterDist, yMarking, pos);
      this.group.add(zW);
    }
  }

  /**
   * Sidewalks, curbs, and corners in the 4 quadrants.
   */
  private buildSidewalks(): void {
    const { roadWidth, roadLength } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const sidewalkWidth = 4.0;
    const curbHeight = 0.25;

    const sidewalkMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.8,
        metalness: 0.05
      })
    );

    const curbMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.7,
        metalness: 0.1
      })
    );

    // Quadrant sidewalk slabs
    const quadrantSize = roadLength - halfWidth;
    const quadGeo = this.trackGeometry(
      new THREE.BoxGeometry(quadrantSize, curbHeight, quadrantSize)
    );

    const quadrants = [
      { x: -(halfWidth + quadrantSize / 2), z: -(halfWidth + quadrantSize / 2) }, // NW
      { x: (halfWidth + quadrantSize / 2), z: -(halfWidth + quadrantSize / 2) },  // NE
      { x: -(halfWidth + quadrantSize / 2), z: (halfWidth + quadrantSize / 2) },  // SW
      { x: (halfWidth + quadrantSize / 2), z: (halfWidth + quadrantSize / 2) }    // SE
    ];

    quadrants.forEach(({ x, z }) => {
      const sidewalk = new THREE.Mesh(quadGeo, sidewalkMat);
      sidewalk.position.set(x, curbHeight / 2, z);
      sidewalk.receiveShadow = true;
      sidewalk.castShadow = true;
      this.group.add(sidewalk);
    });

    // Curbs along the intersection corner edges
    const cornerCurbGeo = this.trackGeometry(new THREE.BoxGeometry(sidewalkWidth, curbHeight + 0.02, 0.4));
    const cornerCurbGeoV = this.trackGeometry(new THREE.BoxGeometry(0.4, curbHeight + 0.02, sidewalkWidth));

    quadrants.forEach(({ x, z }) => {
      const signX = Math.sign(x);
      const signZ = Math.sign(z);

      const curbH = new THREE.Mesh(cornerCurbGeo, curbMat);
      curbH.position.set(signX * (halfWidth + sidewalkWidth / 2), (curbHeight + 0.02) / 2, signZ * halfWidth);
      this.group.add(curbH);

      const curbV = new THREE.Mesh(cornerCurbGeoV, curbMat);
      curbV.position.set(signX * halfWidth, (curbHeight + 0.02) / 2, signZ * (halfWidth + sidewalkWidth / 2));
      this.group.add(curbV);
    });
  }

  /**
   * Procedural decorative scenery: Low-poly buildings, stylized trees, and street lamps.
   */
  private buildScenery(): void {
    const { roadWidth } = this.dimensions;
    const halfWidth = roadWidth / 2;
    const setback = halfWidth + 6;

    // Building Materials
    const buildingColors = [0x1e293b, 0x334155, 0x1f2937, 0x27272a, 0x18181b];
    const windowMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
        roughness: 0.3
      })
    );

    // Procedural Buildings in 4 quadrants (foreground kept low/setback so intersection is fully visible)
    const buildingConfigs = [
      // NW Quadrant (Background skyline)
      { x: -setback - 16, z: -setback - 16, w: 22, d: 22, h: 38, col: 0 },
      { x: -setback - 42, z: -setback - 14, w: 18, d: 24, h: 48, col: 1 },
      { x: -setback - 16, z: -setback - 42, w: 24, d: 18, h: 32, col: 2 },
      // NE Quadrant (Background right)
      { x: setback + 16, z: -setback - 16, w: 22, d: 22, h: 40, col: 3 },
      { x: setback + 42, z: -setback - 18, w: 18, d: 24, h: 52, col: 0 },
      { x: setback + 18, z: -setback - 42, w: 24, d: 18, h: 34, col: 4 },
      // SW Quadrant (Left flank)
      { x: -setback - 22, z: setback + 22, w: 22, d: 20, h: 22, col: 1 },
      { x: -setback - 46, z: setback + 22, w: 18, d: 20, h: 32, col: 2 },
      { x: -setback - 22, z: setback + 46, w: 20, d: 22, h: 36, col: 3 },
      // SE Quadrant (Foreground - positioned far back with low heights to avoid occluding camera)
      { x: setback + 32, z: setback + 32, w: 18, d: 18, h: 10, col: 4 },
      { x: setback + 54, z: setback + 22, w: 18, d: 22, h: 14, col: 0 },
      { x: setback + 22, z: setback + 54, w: 20, d: 18, h: 12, col: 1 }
    ];

    buildingConfigs.forEach(cfg => {
      const bMat = this.trackMaterial(
        new THREE.MeshStandardMaterial({
          color: buildingColors[cfg.col],
          roughness: 0.7,
          metalness: 0.2
        })
      );
      const bGeo = this.trackGeometry(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d));
      const building = new THREE.Mesh(bGeo, bMat);
      building.position.set(cfg.x, cfg.h / 2 + 0.25, cfg.z);
      building.castShadow = true;
      building.receiveShadow = true;
      this.group.add(building);

      // Decorative window band on top / facade
      const bandHeight = Math.min(2.5, cfg.h * 0.1);
      const bandGeo = this.trackGeometry(new THREE.BoxGeometry(cfg.w + 0.1, bandHeight, cfg.d + 0.1));
      const band = new THREE.Mesh(bandGeo, windowMat);
      band.position.set(cfg.x, cfg.h - bandHeight, cfg.z);
      this.group.add(band);
    });

    // Procedural Stylized Trees along sidewalk borders
    const trunkMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x451a03,
        roughness: 0.9
      })
    );
    const foliageMatA = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        roughness: 0.8
      })
    );
    const foliageMatB = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x15803d,
        roughness: 0.85
      })
    );

    const trunkGeo = this.trackGeometry(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6));
    const foliageGeoCone = this.trackGeometry(new THREE.ConeGeometry(1.8, 3.8, 7));
    const foliageGeoSphere = this.trackGeometry(new THREE.DodecahedronGeometry(1.6, 1));

    const treePositions = [
      // Along North arm
      { x: -(halfWidth + 2.5), z: -18 },
      { x: -(halfWidth + 2.5), z: -28 },
      { x: -(halfWidth + 2.5), z: -38 },
      { x: halfWidth + 2.5, z: -18 },
      { x: halfWidth + 2.5, z: -28 },
      { x: halfWidth + 2.5, z: -38 },
      // Along South arm
      { x: -(halfWidth + 2.5), z: 18 },
      { x: -(halfWidth + 2.5), z: 28 },
      { x: -(halfWidth + 2.5), z: 38 },
      { x: halfWidth + 2.5, z: 18 },
      { x: halfWidth + 2.5, z: 28 },
      { x: halfWidth + 2.5, z: 38 },
      // Along East arm
      { x: 18, z: -(halfWidth + 2.5) },
      { x: 28, z: -(halfWidth + 2.5) },
      { x: 38, z: -(halfWidth + 2.5) },
      { x: 18, z: halfWidth + 2.5 },
      { x: 28, z: halfWidth + 2.5 },
      { x: 38, z: halfWidth + 2.5 },
      // Along West arm
      { x: -18, z: -(halfWidth + 2.5) },
      { x: -28, z: -(halfWidth + 2.5) },
      { x: -38, z: -(halfWidth + 2.5) },
      { x: -18, z: halfWidth + 2.5 },
      { x: -28, z: halfWidth + 2.5 },
      { x: -38, z: halfWidth + 2.5 }
    ];

    treePositions.forEach((pos, idx) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(pos.x, 0.25, pos.z);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const isCone = idx % 2 === 0;
      const foliageMesh = new THREE.Mesh(
        isCone ? foliageGeoCone : foliageGeoSphere,
        idx % 3 === 0 ? foliageMatA : foliageMatB
      );
      foliageMesh.position.y = 2.4 + (isCone ? 1.8 : 1.3);
      foliageMesh.castShadow = true;
      treeGroup.add(foliageMesh);

      this.group.add(treeGroup);
    });

    // Street Lamps at 4 intersection corner sidewalks
    const poleMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.8,
        roughness: 0.3
      })
    );
    const lampGlowMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfef08a,
        emissiveIntensity: 0.8
      })
    );

    const poleGeo = this.trackGeometry(new THREE.CylinderGeometry(0.12, 0.16, 5.0, 6));
    const armGeo = this.trackGeometry(new THREE.BoxGeometry(1.2, 0.1, 0.1));
    const bulbGeo = this.trackGeometry(new THREE.SphereGeometry(0.2, 8, 8));

    const lampCorners = [
      { x: -(halfWidth + 1.2), z: -(halfWidth + 1.2), rot: Math.PI / 4 },
      { x: halfWidth + 1.2, z: -(halfWidth + 1.2), rot: -Math.PI / 4 },
      { x: -(halfWidth + 1.2), z: halfWidth + 1.2, rot: (3 * Math.PI) / 4 },
      { x: halfWidth + 1.2, z: halfWidth + 1.2, rot: (-3 * Math.PI) / 4 }
    ];

    lampCorners.forEach(corner => {
      const lamp = new THREE.Group();
      lamp.position.set(corner.x, 0.25, corner.z);
      lamp.rotation.y = corner.rot;

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 2.5;
      pole.castShadow = true;
      lamp.add(pole);

      const lampArm = new THREE.Mesh(armGeo, poleMat);
      lampArm.position.set(0.5, 4.8, 0);
      lamp.add(lampArm);

      const bulb = new THREE.Mesh(bulbGeo, lampGlowMat);
      bulb.position.set(1.0, 4.7, 0);
      lamp.add(bulb);

      this.group.add(lamp);
    });
  }

  /**
   * Complete memory cleanup for geometries and materials.
   */
  public dispose(): void {
    this.geometries.forEach(geo => geo.dispose());
    this.materials.forEach(mat => mat.dispose());
    this.geometries = [];
    this.materials = [];
    this.group.clear();
  }
}
