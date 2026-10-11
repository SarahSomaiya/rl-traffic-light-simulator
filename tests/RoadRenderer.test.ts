import { describe, it, expect } from 'vitest';
import { RoadRenderer } from '../src/renderer/RoadRenderer';
import * as THREE from 'three';

describe('RoadRenderer Test Suite', () => {
  it('should initialize procedural road network with default dimensions', () => {
    const roadRenderer = new RoadRenderer();
    const group = roadRenderer.getRoot();

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe('RoadEnvironment');
    expect(group.children.length).toBeGreaterThan(10);
  });

  it('should include terrain ground plane with proper orientation', () => {
    const roadRenderer = new RoadRenderer();
    const group = roadRenderer.getRoot();
    const ground = group.getObjectByName('GroundTerrain') as THREE.Mesh;

    expect(ground).toBeDefined();
    expect(ground.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(ground.receiveShadow).toBe(true);
  });

  it('should properly configure intersection center geometry', () => {
    const roadRenderer = new RoadRenderer();
    const group = roadRenderer.getRoot();
    const center = group.getObjectByName('IntersectionCenter') as THREE.Mesh;

    expect(center).toBeDefined();
    expect(center.geometry).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('should cleanly dispose all tracked geometries and materials without memory leaks', () => {
    const roadRenderer = new RoadRenderer();
    const group = roadRenderer.getRoot();

    expect(group.children.length).toBeGreaterThan(0);
    roadRenderer.dispose();
    expect(group.children.length).toBe(0);
  });
});
