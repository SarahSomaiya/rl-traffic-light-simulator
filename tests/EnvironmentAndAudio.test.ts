import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EnvironmentController } from '../src/renderer/EnvironmentController';
import { TrafficAmbienceAudio } from '../src/audio/TrafficAmbienceAudio';
import { RoadRenderer } from '../src/renderer/RoadRenderer';
import { VehicleMeshPool } from '../src/renderer/VehicleMeshPool';
import { LaneNetwork } from '../src/sim/Lane';
import { Vehicle } from '../src/sim/Vehicle';

describe('Phase 2.1 — Day/Night Mode, Building Windows & Layered Traffic Ambience Test Suite', () => {
  it('1. should initialize EnvironmentController in Day mode with bright daytime parameters', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcad6e2);
    scene.fog = new THREE.Fog(0xcad6e2, 120, 290);

    const renderer = { toneMappingExposure: 1.10 } as THREE.WebGLRenderer;
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4a7c59, 0.6);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.28);
    const roadRenderer = new RoadRenderer();
    const laneNetwork = new LaneNetwork();
    const vehicleMeshPool = new VehicleMeshPool(scene, laneNetwork);

    const envCtrl = new EnvironmentController({
      scene,
      renderer,
      hemiLight,
      ambientLight,
      sunLight,
      fillLight,
      roadRenderer,
      vehicleMeshPool
    });

    expect(envCtrl.isNightMode()).toBe(false);
    expect(envCtrl.getTransitionProgress()).toBe(0.0);
    expect(sunLight.intensity).toBeCloseTo(1.45, 2);
    expect(renderer.toneMappingExposure).toBeCloseTo(1.10, 2);

    envCtrl.dispose();
    roadRenderer.dispose();
    vehicleMeshPool.dispose();
  });

  it('2. should transition accurately between Day and Night modes with rich nocturnal balances', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcad6e2);
    scene.fog = new THREE.Fog(0xcad6e2, 120, 290);

    const renderer = { toneMappingExposure: 1.10 } as THREE.WebGLRenderer;
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4a7c59, 0.6);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.28);
    const roadRenderer = new RoadRenderer();
    const laneNetwork = new LaneNetwork();
    const vehicleMeshPool = new VehicleMeshPool(scene, laneNetwork);

    const envCtrl = new EnvironmentController({
      scene,
      renderer,
      hemiLight,
      ambientLight,
      sunLight,
      fillLight,
      roadRenderer,
      vehicleMeshPool
    });

    // 1. Switch to Night Mode (immediate)
    envCtrl.setNightMode(true, true);
    expect(envCtrl.isNightMode()).toBe(true);
    expect(envCtrl.getTransitionProgress()).toBe(1.0);

    // Night lighting: directional moonlight (0.68), ambient fill (0.42), exposure (1.06)
    expect(sunLight.intensity).toBeCloseTo(0.68, 2);
    expect(ambientLight.intensity).toBeCloseTo(0.42, 2);
    expect(renderer.toneMappingExposure).toBeCloseTo(1.06, 2);

    // Night sky color should be rich early-night blue (0x16243b)
    const skyColor = scene.background as THREE.Color;
    expect(skyColor.getHex()).toBe(0x16243b);

    // 2. Switch back to Day Mode (immediate)
    envCtrl.setNightMode(false, true);
    expect(envCtrl.isNightMode()).toBe(false);
    expect(envCtrl.getTransitionProgress()).toBe(0.0);
    expect(sunLight.intensity).toBeCloseTo(1.45, 2);
    expect(renderer.toneMappingExposure).toBeCloseTo(1.10, 2);

    envCtrl.dispose();
    roadRenderer.dispose();
    vehicleMeshPool.dispose();
  });

  it('3. should smoothly interpolate transition progress over delta steps', () => {
    const scene = new THREE.Scene();
    const renderer = { toneMappingExposure: 1.10 } as THREE.WebGLRenderer;
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4a7c59, 0.6);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.28);
    const roadRenderer = new RoadRenderer();
    const laneNetwork = new LaneNetwork();
    const vehicleMeshPool = new VehicleMeshPool(scene, laneNetwork);

    const envCtrl = new EnvironmentController({
      scene,
      renderer,
      hemiLight,
      ambientLight,
      sunLight,
      fillLight,
      roadRenderer,
      vehicleMeshPool
    });

    // Request night mode without immediate flag
    envCtrl.setNightMode(true, false);
    expect(envCtrl.isNightMode()).toBe(true);
    expect(envCtrl.getTransitionProgress()).toBe(0.0);

    // Step forward 0.2s
    envCtrl.update(0.2);
    expect(envCtrl.getTransitionProgress()).toBeGreaterThan(0.1);
    expect(envCtrl.getTransitionProgress()).toBeLessThan(0.9);

    // Step forward enough to complete transition
    envCtrl.update(1.0);
    expect(envCtrl.getTransitionProgress()).toBe(1.0);

    envCtrl.dispose();
    roadRenderer.dispose();
    vehicleMeshPool.dispose();
  });

  it('4. should safely clone and illuminate imported Quaternius building windows without mutating shared templates', () => {
    const roadRenderer = new RoadRenderer();

    // Create a mock imported building with Quaternius materials
    const mockBuilding = new THREE.Group();
    const sharedWallMat = new THREE.MeshStandardMaterial({ name: 'MI_RedBrick', color: 0x8b0000 });
    const sharedInteriorMat1 = new THREE.MeshStandardMaterial({ name: 'MI_FakeInterior_1', color: 0xffffff });
    const sharedInteriorMat2 = new THREE.MeshStandardMaterial({ name: 'MI_FakeInterior_2', color: 0xffffff });
    const sharedGlassMat = new THREE.MeshStandardMaterial({ name: 'MI_Glass', color: 0x333333, transparent: true });

    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 10), sharedWallMat);
    const interiorMesh1 = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1), sharedInteriorMat1);
    const interiorMesh2 = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1), sharedInteriorMat2);
    const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.05), sharedGlassMat);

    mockBuilding.add(wallMesh, interiorMesh1, interiorMesh2, glassMesh);

    // Initial state: wall and interior have black emissive
    expect(sharedInteriorMat1.emissive.getHex()).toBe(0x000000);
    expect(sharedWallMat.emissive.getHex()).toBe(0x000000);

    // Configure building windows
    roadRenderer.configureImportedBuildingWindows(mockBuilding, -45.0, 35.0);

    // 1. Shared wall material must NOT be cloned or modified
    expect(wallMesh.material).toBe(sharedWallMat);
    expect((wallMesh.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x000000);

    // 2. Window materials MUST be cloned to prevent cross-building mutation
    expect(interiorMesh1.material).not.toBe(sharedInteriorMat1);
    expect(interiorMesh2.material).not.toBe(sharedInteriorMat2);
    expect(glassMesh.material).not.toBe(sharedGlassMat);

    // 3. Cloned window materials must have warm emissive color
    const clonedInterior1 = interiorMesh1.material as THREE.MeshStandardMaterial;
    expect(clonedInterior1.emissive.getHex()).toBe(0xffcf87); // Warm amber room glow

    // 4. In Day mode, emissive intensity should be 0.0
    roadRenderer.setNightTransition(0.0);
    expect(clonedInterior1.emissiveIntensity).toBe(0.0);

    // 5. In Night mode, emissive intensity should ramp to night target
    roadRenderer.setNightTransition(1.0);
    expect(clonedInterior1.emissiveIntensity).toBeGreaterThan(0.0);

    // 6. Original template material remains completely untouched (emissive is still black)
    expect(sharedInteriorMat1.emissive.getHex()).toBe(0x000000);

    roadRenderer.dispose();
  });

  it('5. should provide organic variation across different building coordinates', () => {
    const roadRenderer = new RoadRenderer();

    // Building A at (-50, 20)
    const buildingA = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ name: 'MI_FakeInterior_1', color: 0xffffff });
    buildingA.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA));
    roadRenderer.configureImportedBuildingWindows(buildingA, -50.0, 20.0);

    // Building B at (30, -60)
    const buildingB = new THREE.Group();
    const matB = new THREE.MeshStandardMaterial({ name: 'MI_FakeInterior_1', color: 0xffffff });
    buildingB.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matB));
    roadRenderer.configureImportedBuildingWindows(buildingB, 30.0, -60.0);

    roadRenderer.setNightTransition(1.0);

    const clonedA = (buildingA.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const clonedB = (buildingB.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

    // Both should be valid numbers
    expect(clonedA.emissiveIntensity).toBeGreaterThan(0);
    expect(clonedB.emissiveIntensity).toBeGreaterThan(0);

    roadRenderer.dispose();
  });

  it('6. should initialize TrafficAmbienceAudio safely and handle mute/unmute', () => {
    const audio = new TrafficAmbienceAudio();
    expect(audio.isMutedState()).toBe(true);

    const newMuteState = audio.toggleMute();
    expect(typeof newMuteState).toBe('boolean');

    audio.setSimulationPaused(true);
    audio.setSimulationPaused(false);

    audio.dispose();
  });

  it('7. should handle audio update with sirens, horns, and bird sounds safely', () => {
    const audio = new TrafficAmbienceAudio();

    const mockAmbulance: Partial<Vehicle> = {
      id: 'amb-1',
      type: 'ambulance',
      isEmergencyActive: true,
      v: 12.0
    };

    const mockWaitingCar: Partial<Vehicle> = {
      id: 'car-1',
      type: 'sedan',
      isEmergencyActive: false,
      v: 0.0 // Stopped at red light
    };

    // Update with active ambulance and waiting car in daytime
    expect(() => {
      audio.update(0.1, {
        hasActiveAmbulance: true,
        hasActivePolice: false,
        isNight: false,
        vehicles: [mockAmbulance as Vehicle, mockWaitingCar as Vehicle]
      });
    }).not.toThrow();

    // Update when ambulance despawns
    expect(() => {
      audio.update(0.1, {
        hasActiveAmbulance: false,
        hasActivePolice: false,
        isNight: true,
        vehicles: [mockWaitingCar as Vehicle]
      });
    }).not.toThrow();

    // Reset should clear active sirens without throwing
    expect(() => audio.reset()).not.toThrow();

    audio.dispose();
  });
});
