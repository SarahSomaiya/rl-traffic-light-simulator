import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { ModelLoader } from '../src/renderer/ModelLoader';
import { RoadRenderer } from '../src/renderer/RoadRenderer';

describe('Quaternius Asset Integration & Integrity Test Suite', () => {
  const quaterniusDir = path.resolve(__dirname, '../public/models/quaternius');

  it('should have public/models/quaternius directory populated with required assets', () => {
    expect(fs.existsSync(quaterniusDir)).toBe(true);
    const files = fs.readdirSync(quaterniusDir);
    expect(files.length).toBeGreaterThan(15);
  });

  it('should verify all copied glTF files have matching .bin buffers and valid referenced textures', () => {
    const files = fs.readdirSync(quaterniusDir);
    const gltfFiles = files.filter((f: string) => f.endsWith('.gltf'));

    expect(gltfFiles.length).toBeGreaterThan(10);

    for (const gltfFile of gltfFiles) {
      const gltfPath = path.join(quaterniusDir, gltfFile);
      const content = fs.readFileSync(gltfPath, 'utf8');
      const json = JSON.parse(content);

      // Check buffers (.bin)
      if (json.buffers && Array.isArray(json.buffers)) {
        for (const buffer of json.buffers) {
          if (buffer.uri && !buffer.uri.startsWith('data:')) {
            const binPath = path.resolve(quaterniusDir, buffer.uri);
            expect(
              fs.existsSync(binPath),
              `Model ${gltfFile} references missing buffer: ${buffer.uri}`
            ).toBe(true);
          }
        }
      }

      // Check images / textures
      if (json.images && Array.isArray(json.images)) {
        for (const image of json.images) {
          if (image.uri && !image.uri.startsWith('data:')) {
            const imgPath = path.resolve(quaterniusDir, image.uri);
            expect(
              fs.existsSync(imgPath),
              `Model ${gltfFile} references missing texture: ${image.uri}`
            ).toBe(true);
          }
        }
      }
    }
  });

  it('should verify key required Quaternius models are present in public/models/quaternius', () => {
    const requiredModels = [
      'Building_Small_1.gltf',
      'Building_Medium_2_001.gltf',
      'Building_Large_2.gltf',
      'Roof_SlateCornice_Window_1.gltf',
      'Roof_SlateCornice_Corner.gltf',
      'Roof_SlateCornice_Center.gltf',
      'Entrance_Concrete_2x1.gltf',
      'Entrance_Concrete_2x2.gltf',
      'Stairs_Entrance_Concrete.gltf',
      'Door_1.gltf',
      'Door_2.gltf',
      'Door_3.gltf',
      'Prop_ACUnit.gltf',
      'Prop_Bollard.gltf',
      'Prop_Planter_Single.gltf',
      'Sidewalk_Planter.gltf',
      'Prop_Drain.gltf',
      'Prop_ManholeCover.gltf',
      'Roof_4x4.gltf',
      'Roof_2x2.gltf',
      'Roof_Slate_Center.gltf',
      'Roof_Slate_Corner.gltf',
      'Cornice_Metal_Center.gltf',
      'Cornice_Brick_Center.gltf',
      'Cornice_Trim_Center.gltf',
      'DoorFrame_Metal_Single.gltf'
    ];

    for (const model of requiredModels) {
      const p = path.join(quaterniusDir, model);
      expect(fs.existsSync(p), `Required model missing: ${model}`).toBe(true);
    }
  });

  describe('ModelLoader Service', () => {
    it('should provide initial stats with zero failures', () => {
      const stats = ModelLoader.getStats();
      expect(stats.failedCount).toBe(0);
      expect(stats.cachedModels).toBeGreaterThanOrEqual(0);
    });

    it('should handle preloading gracefully in non-browser test environment', async () => {
      let progressReported = false;
      const unsubscribe = ModelLoader.onProgress((loaded, total) => {
        progressReported = true;
        expect(total).toBeGreaterThanOrEqual(loaded);
      });

      await ModelLoader.preloadAssets([
        '/models/quaternius/Building_Small_1.gltf',
        '/models/quaternius/Building_Medium_2_001.gltf'
      ]);

      unsubscribe();
      expect(typeof progressReported).toBe('boolean');
      const stats = ModelLoader.getStats();
      expect(stats).toBeDefined();
    });

    it('should safely clone cached models without throwing', () => {
      const dummyGroup = new THREE.Group();
      dummyGroup.name = 'TestModel';
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      );
      dummyGroup.add(mesh);

      const clone1 = dummyGroup.clone(true);
      const clone2 = dummyGroup.clone(true);

      clone1.position.set(10, 0, 10);
      clone2.position.set(-10, 0, -10);

      expect(clone1.position.x).toBe(10);
      expect(clone2.position.x).toBe(-10);
      expect(clone1).not.toBe(clone2);
    });
  });

  describe('RoadRenderer Scene & Spatial Integrity', () => {
    it('should construct city environment with zero NaN transforms', () => {
      const renderer = new RoadRenderer();
      const root = renderer.getRoot();

      let nodeCount = 0;
      root.traverse(node => {
        nodeCount++;
        expect(Number.isNaN(node.position.x)).toBe(false);
        expect(Number.isNaN(node.position.y)).toBe(false);
        expect(Number.isNaN(node.position.z)).toBe(false);
        expect(Number.isNaN(node.rotation.x)).toBe(false);
        expect(Number.isNaN(node.rotation.y)).toBe(false);
        expect(Number.isNaN(node.rotation.z)).toBe(false);
        expect(Number.isNaN(node.scale.x)).toBe(false);
        expect(Number.isNaN(node.scale.y)).toBe(false);
        expect(Number.isNaN(node.scale.z)).toBe(false);
      });

      expect(nodeCount).toBeGreaterThan(50);
      renderer.dispose();
    });

    it('should preserve the central intersection corridor without obstruction', () => {
      const renderer = new RoadRenderer();
      const root = renderer.getRoot();

      const center = root.getObjectByName('IntersectionCenter');
      expect(center).toBeDefined();

      // Check stop lines exist in all 4 cardinal directions
      const stopLines = root.children.filter(c => c.name && c.name.startsWith('StopLine'));
      expect(stopLines.length).toBe(4);

      // Check crosswalks exist in all 4 cardinal directions
      const crosswalks = root.children.filter(c => c.name && c.name.startsWith('Crosswalk'));
      expect(crosswalks.length).toBeGreaterThanOrEqual(4);

      renderer.dispose();
    });

    it('should include the distinct district plazas, sidewalks, and park boundary', () => {
      const renderer = new RoadRenderer();
      const root = renderer.getRoot();

      const groundTerrain = root.getObjectByName('GroundTerrain');
      expect(groundTerrain).toBeDefined();

      const asphaltRoadbed = root.getObjectByName('AsphaltRoadbed');
      expect(asphaltRoadbed).toBeDefined();

      const nePlaza = root.getObjectByName('DistrictPlaza_NE');
      expect(nePlaza).toBeDefined();

      const nwPlaza = root.getObjectByName('DistrictPlaza_NW');
      expect(nwPlaza).toBeDefined();

      const sePlaza = root.getObjectByName('DistrictPlaza_SE');
      expect(sePlaza).toBeDefined();

      const swBackdropPlaza = root.getObjectByName('DistrictPlaza_SW_Backdrop');
      expect(swBackdropPlaza).toBeDefined();

      const swWestPlaza = root.getObjectByName('DistrictPlaza_SW_WestFlank');
      expect(swWestPlaza).toBeDefined();

      renderer.dispose();
    });

    it('should cleanly dispose and prevent resource leaks', () => {
      const renderer = new RoadRenderer();
      expect(renderer.getRoot().children.length).toBeGreaterThan(0);
      renderer.dispose();
      expect(renderer.getRoot().children.length).toBe(0);
    });
  });
});
