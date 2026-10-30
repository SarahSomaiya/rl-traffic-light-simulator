import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VehicleMeshPool } from '../src/renderer/VehicleMeshPool';
import { LaneNetwork } from '../src/sim/Lane';
import { Vehicle } from '../src/sim/Vehicle';
import { VehicleType } from '../src/types';

describe('VehicleMeshPool & 3D Vehicle Visuals Test Suite', () => {
  const allTypes: VehicleType[] = [
    'sedan',
    'hatchback',
    'suv',
    'taxi',
    'police',
    'ambulance',
    'van'
  ];

  it('1. should construct and pre-populate pool with diverse vehicle types', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    const pooledList = pool.getPool();
    expect(pooledList.length).toBeGreaterThanOrEqual(allTypes.length);

    allTypes.forEach(t => {
      const found = pooledList.find(p => p.type === t);
      expect(found).toBeDefined();
      expect(found?.group).toBeInstanceOf(THREE.Group);
      expect(found?.bodyMesh).toBeInstanceOf(THREE.Mesh);
      expect(found?.inUse).toBe(false);
      expect(found?.group.visible).toBe(false);
    });

    pool.dispose();
  });

  it('2. should build structurally valid geometry with zero NaN transforms for all 7 classes', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    allTypes.forEach(t => {
      const v = new Vehicle({
        id: `test_${t}`,
        laneId: 'SOUTH_0',
        type: t,
        s: 10,
        v: 5
      });

      pool.sync([v], 0);

      const pooled = pool.getPool().find(p => p.inUse && p.type === t);
      expect(pooled).toBeDefined();
      expect(pooled?.group.visible).toBe(true);

      // Verify no NaN or infinite values in transforms
      pooled?.group.traverse(child => {
        expect(Number.isFinite(child.position.x)).toBe(true);
        expect(Number.isFinite(child.position.y)).toBe(true);
        expect(Number.isFinite(child.position.z)).toBe(true);
        expect(Number.isFinite(child.rotation.x)).toBe(true);
        expect(Number.isFinite(child.rotation.y)).toBe(true);
        expect(Number.isFinite(child.rotation.z)).toBe(true);
        expect(Number.isFinite(child.scale.x)).toBe(true);
        expect(Number.isFinite(child.scale.y)).toBe(true);
        expect(Number.isFinite(child.scale.z)).toBe(true);
      });

      // Verify bounding box height and length are non-zero and positive
      const bbox = new THREE.Box3().setFromObject(pooled!.group);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      expect(size.x).toBeGreaterThan(1.5);
      expect(size.y).toBeGreaterThan(1.2);
      expect(size.z).toBeGreaterThan(3.5);

      pool.clear();
    });

    pool.dispose();
  });

  it('3. should align wheel contact at ground asphalt plane (Y ~= 0) with forward headlights at +Z', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    const sedan = new Vehicle({
      id: 'test_sedan',
      laneId: 'NORTH_0',
      type: 'sedan',
      s: 20,
      v: 0
    });

    pool.sync([sedan], 0);
    const pooled = pool.getPool().find(p => p.inUse && p.type === 'sedan')!;
    expect(pooled).toBeDefined();

    // Group position Y is 0.0
    expect(pooled.group.position.y).toBe(0.0);

    // Compute local bounding box with group at origin
    pooled.group.position.set(0, 0, 0);
    pooled.group.rotation.set(0, 0, 0);
    const bbox = new THREE.Box3().setFromObject(pooled.group);

    // Lowest point (bottom of tires) should be approximately 0.0 (allowing small float margin)
    expect(bbox.min.y).toBeCloseTo(0.0, 1);

    // Front of vehicle (+Z) is greater than rear of vehicle (-Z)
    expect(bbox.max.z).toBeGreaterThan(0);
    expect(bbox.min.z).toBeLessThan(0);
    expect(Math.abs(bbox.max.z)).toBeGreaterThan(1.5);
    expect(Math.abs(bbox.min.z)).toBeGreaterThan(1.5);

    pool.dispose();
  });

  it('4. should update dynamic body paint color across pooled meshes', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    const customColor = 0xff0055;
    const v = new Vehicle({
      id: 'custom_color_v',
      laneId: 'SOUTH_0',
      type: 'sedan',
      colorHex: customColor,
      s: 15
    });

    pool.sync([v], 0);
    const pooled = pool.getPool().find(p => p.inUse)!;
    expect(pooled).toBeDefined();

    const mat = pooled.bodyMesh.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(customColor);

    pool.dispose();
  });

  it('5. should synchronize deterministic emergency strobe beacon flashing with simTime', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    const police = new Vehicle({
      id: 'police_test',
      laneId: 'SOUTH_0',
      type: 'police',
      isEmergencyActive: true,
      s: 30
    });

    // Phase A (simTime = 0.0 -> floor(0.0 * 4) % 2 === 0 -> Phase A)
    pool.sync([police], 0.0);
    const pooled = pool.getPool().find(p => p.inUse && p.type === 'police')!;
    expect(pooled).toBeDefined();
    expect(pooled.emergencyLeftLight).toBeDefined();
    expect(pooled.emergencyRightLight).toBeDefined();

    const leftMatPhaseA = pooled.emergencyLeftLight!.material as THREE.MeshStandardMaterial;
    const rightMatPhaseA = pooled.emergencyRightLight!.material as THREE.MeshStandardMaterial;
    // Phase A: Left is Blue active, Right is dim
    expect(leftMatPhaseA.color.getHex()).toBe(0x3b82f6);
    expect(rightMatPhaseA.color.getHex()).toBe(0x334155);

    // Phase B (simTime = 0.3 -> floor(0.3 * 4) = 1 % 2 === 1 -> Phase B)
    pool.sync([police], 0.3);
    const leftMatPhaseB = pooled.emergencyLeftLight!.material as THREE.MeshStandardMaterial;
    const rightMatPhaseB = pooled.emergencyRightLight!.material as THREE.MeshStandardMaterial;
    // Phase B: Left is dim, Right is Red active
    expect(leftMatPhaseB.color.getHex()).toBe(0x334155);
    expect(rightMatPhaseB.color.getHex()).toBe(0xef4444);

    // When emergency is deactivated, both strobes turn dim
    police.setEmergencyActive(false);
    pool.sync([police], 0.3);
    const leftMatInactive = pooled.emergencyLeftLight!.material as THREE.MeshStandardMaterial;
    const rightMatInactive = pooled.emergencyRightLight!.material as THREE.MeshStandardMaterial;
    expect(leftMatInactive.color.getHex()).toBe(0x334155);
    expect(rightMatInactive.color.getHex()).toBe(0x334155);

    pool.dispose();
  });

  it('6. should clean up all meshes, geometries and materials without memory leaks on dispose', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    const v = new Vehicle({ id: 'v1', laneId: 'SOUTH_0', type: 'van', s: 10 });
    pool.sync([v], 0);

    expect(pool.getPool().length).toBeGreaterThan(0);
    expect(scene.children.length).toBeGreaterThan(0);

    pool.dispose();
    expect(pool.getPool().length).toBe(0);
  });
});
