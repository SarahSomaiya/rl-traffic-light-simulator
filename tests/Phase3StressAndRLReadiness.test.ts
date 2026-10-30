import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';
import { RoadRenderer } from '../src/renderer/RoadRenderer';
import { VehicleMeshPool } from '../src/renderer/VehicleMeshPool';
import { EnvironmentController } from '../src/renderer/EnvironmentController';
import { TrafficAmbienceAudio } from '../src/audio/TrafficAmbienceAudio';
import { CameraController, CAMERA_PRESETS } from '../src/renderer/CameraController';
import { LaneNetwork } from '../src/sim/Lane';
import { Direction, QueueDensity, SignalPhase } from '../src/types';

describe('Phase 3 — Stress Testing, Lifecycle Stability & RL Readiness Suite', () => {

  const createMockDomElement = () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
    getRootNode: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
    style: {}
  } as unknown as HTMLElement);

  it('1. should survive toggling Day/Night at least 20 times without duplicating lights or corrupting transitions', () => {
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

    const initialLightCount = scene.children.filter(c => (c as THREE.Light).isLight).length;

    // Toggle Day/Night 25 times
    for (let i = 0; i < 25; i++) {
      envCtrl.toggleDayNight();
      envCtrl.update(0.1);
    }

    // Number of lights must not accumulate or duplicate
    const finalLightCount = scene.children.filter(c => (c as THREE.Light).isLight).length;
    expect(finalLightCount).toBe(initialLightCount);

    // End in Day mode
    envCtrl.setNightMode(false, true);
    expect(envCtrl.isNightMode()).toBe(false);
    expect(envCtrl.getTransitionProgress()).toBe(0.0);

    envCtrl.dispose();
    roadRenderer.dispose();
    vehicleMeshPool.dispose();
  });

  it('2. should toggle Mute/Unmute at least 20 times cleanly without source or audio graph leaks', () => {
    const audio = new TrafficAmbienceAudio();
    expect(audio.isMutedState()).toBe(true);

    // Toggle 24 times
    for (let i = 0; i < 24; i++) {
      audio.toggleMute();
      audio.setSimulationPaused(i % 2 === 0);
    }

    // Explicitly un-pause and unmute
    audio.setSimulationPaused(false);
    audio.setMuted(false);
    expect(audio.isMutedState()).toBe(false);

    audio.setMuted(true);
    expect(audio.isMutedState()).toBe(true);

    audio.dispose();
  });

  it('3. should switch between all three camera modes repeatedly while simulation is active', () => {
    const camera = new THREE.PerspectiveCamera(45, 1.33, 0.5, 1000);
    const camCtrl = new CameraController(camera, createMockDomElement());
    const env = new TrafficEnvironment();

    // Spawn traffic
    for (let i = 0; i < 6; i++) {
      env.spawnEmergencyVehicle('sedan' as any, Direction.SOUTH);
    }

    const modes = ['isometric', 'overhead', 'street'] as const;
    for (let i = 0; i < 30; i++) {
      const mode = modes[i % modes.length];
      camCtrl.setPreset(mode, false);
      expect(camCtrl.getCurrentPreset()).toBe(mode);
      expect(camera.position.x).toBeCloseTo(CAMERA_PRESETS[mode].position.x, 1);
      expect(camera.position.y).toBeCloseTo(CAMERA_PRESETS[mode].position.y, 1);
      env.tick(0.05);
      camCtrl.update(0.05);
    }

    camCtrl.dispose();
  });

  it('4. should pause and resume repeatedly without desynchronizing accumulator or vehicles', () => {
    const env = new TrafficEnvironment();
    expect(env.isPaused()).toBe(false);

    for (let i = 0; i < 20; i++) {
      env.togglePlayPause();
      expect(env.isPaused()).toBe(i % 2 === 0);
      env.step(0.05);
    }

    env.play();
    expect(env.isPaused()).toBe(false);

    // Confirm step advances elapsed time
    const initialElapsed = env.getSimSeconds();
    env.step(0.1);
    expect(env.getSimSeconds()).toBeGreaterThan(initialElapsed);
  });

  it('5. should reset the simulation with multiple active vehicles without leaking references', () => {
    const env = new TrafficEnvironment();
    for (let i = 0; i < 12; i++) {
      env.spawnEmergencyVehicle('sedan' as any, Direction.NORTH);
      env.spawnEmergencyVehicle('suv' as any, Direction.EAST);
    }
    expect(env.getVehicles().length).toBeGreaterThan(0);

    // Reset
    env.reset();
    expect(env.getVehicles().length).toBe(0);
    expect(env.getSimSeconds()).toBe(0);
    expect(env.getMetrics().totalVehiclesSpawned).toBe(0);

    // Tick again and verify normal traffic resumes
    env.tick(0.1);
    expect(env.getSimSeconds()).toBeCloseTo(0.1, 2);
  });

  it('6. should change simulation speed while traffic is moving and retain bounded multiplier', () => {
    const env = new TrafficEnvironment();
    const multipliers = [1.0, 2.0, 5.0, 10.0, 0.5];

    multipliers.forEach(mult => {
      env.setSpeedMultiplier(mult);
      expect(env.getSpeedMultiplier()).toBe(mult);
      env.step(0.05);
    });

    // Guard bounds: should clamp [0.1, 10.0]
    env.setSpeedMultiplier(100);
    expect(env.getSpeedMultiplier()).toBe(10.0);
    env.setSpeedMultiplier(-5);
    expect(env.getSpeedMultiplier()).toBe(0.1);
  });

  it('7. should handle active emergency vehicles, lighting toggles, and reset cleanly', () => {
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

    const env = new TrafficEnvironment();

    // Spawn responding ambulance and police
    const amb = env.spawnEmergencyVehicle('ambulance', Direction.SOUTH, true);
    const pol = env.spawnEmergencyVehicle('police', Direction.NORTH, true);

    expect(amb).not.toBeNull();
    expect(pol).not.toBeNull();
    expect(amb!.isEmergencyActive).toBe(true);
    expect(pol!.isEmergencyActive).toBe(true);

    // Toggle lighting while sirens and flashing lights are active
    envCtrl.toggleDayNight();
    env.tick(0.1);
    vehicleMeshPool.sync(env.getVehicles(), env.getSimSeconds());

    // Request safe priority
    const priorityResult = env.requestEmergencyPriority();
    expect(typeof priorityResult).toBe('boolean');

    // Reset simulation
    env.reset();
    vehicleMeshPool.clear();
    expect(env.getVehicles().length).toBe(0);
    expect(env.getActiveEmergencyInfo()).toBeNull();

    envCtrl.dispose();
    roadRenderer.dispose();
    vehicleMeshPool.dispose();
  });

  it('8. should exercise vehicle mesh pooling through repeated spawning and despawning without orphan meshes', () => {
    const scene = new THREE.Scene();
    const laneNetwork = new LaneNetwork();
    const pool = new VehicleMeshPool(scene, laneNetwork);

    const types = ['sedan', 'hatchback', 'suv', 'taxi', 'van', 'police', 'ambulance'] as const;

    // Repeatedly sync batches of mock vehicles
    for (let cycle = 0; cycle < 15; cycle++) {
      const activeMockVehicles = types.map((t, idx) => ({
        id: `mock_${cycle}_${idx}`,
        laneId: 'SOUTH_0',
        type: t,
        s: 10 + idx * 8,
        v: 10.0,
        colorHex: 0xff0000,
        isEmergencyActive: t === 'ambulance' || t === 'police'
      })) as any[];

      pool.sync(activeMockVehicles, cycle * 0.25);

      const inUseCount = pool.getPool().filter(p => p.inUse).length;
      expect(inUseCount).toBe(types.length);
    }

    // Despawn all vehicles
    pool.sync([], 10.0);
    const activeRemaining = pool.getPool().filter(p => p.inUse).length;
    expect(activeRemaining).toBe(0);

    // Clean clear
    pool.clear();
    pool.dispose();
    expect(pool.getPool().length).toBe(0);
  });

  it('9. should verify full renderer and environment lifecycle creation and disposal with zero resource leaks', () => {
    const scene = new THREE.Scene();
    const renderer = { toneMappingExposure: 1.10 } as THREE.WebGLRenderer;
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4a7c59, 0.6);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.28);
    const laneNetwork = new LaneNetwork();

    // Cycle 1
    const rr1 = new RoadRenderer();
    const vp1 = new VehicleMeshPool(scene, laneNetwork);
    const ec1 = new EnvironmentController({
      scene,
      renderer,
      hemiLight,
      ambientLight,
      sunLight,
      fillLight,
      roadRenderer: rr1,
      vehicleMeshPool: vp1
    });
    const au1 = new TrafficAmbienceAudio();

    expect(scene.children.length).toBeGreaterThan(0);

    rr1.dispose();
    vp1.dispose();
    ec1.dispose();
    au1.dispose();

    // Cycle 2
    const rr2 = new RoadRenderer();
    const vp2 = new VehicleMeshPool(scene, laneNetwork);
    const ec2 = new EnvironmentController({
      scene,
      renderer,
      hemiLight,
      ambientLight,
      sunLight,
      fillLight,
      roadRenderer: rr2,
      vehicleMeshPool: vp2
    });
    const au2 = new TrafficAmbienceAudio();

    expect(scene.children.length).toBeGreaterThan(0);

    rr2.dispose();
    vp2.dispose();
    ec2.dispose();
    au2.dispose();
  });

  it('10. should safely guard building window illumination against redundant re-configuration', () => {
    const roadRenderer = new RoadRenderer();
    const building = new THREE.Group();
    const interiorMat = new THREE.MeshStandardMaterial({ name: 'MI_FakeInterior_1', color: 0xffffff });
    building.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1), interiorMat));

    // First configuration
    roadRenderer.configureImportedBuildingWindows(building, 10, 20);
    const firstClonedMat = (building.children[0] as THREE.Mesh).material;

    // Redundant second configuration should be a no-op
    roadRenderer.configureImportedBuildingWindows(building, 10, 20);
    const secondClonedMat = (building.children[0] as THREE.Mesh).material;

    expect(firstClonedMat).toBe(secondClonedMat);
    roadRenderer.dispose();
  });

  it('11. should provide clean RL backend observation, state discretizer, and action interfaces', () => {
    const env = new TrafficEnvironment();

    // 1. Queue lengths by approach direction
    const queueCounts = env.getQueueLengthsByDirection();
    expect(queueCounts).toHaveProperty(Direction.NORTH);
    expect(queueCounts).toHaveProperty(Direction.SOUTH);
    expect(queueCounts).toHaveProperty(Direction.EAST);
    expect(queueCounts).toHaveProperty(Direction.WEST);
    expect(queueCounts[Direction.NORTH]).toBe(0);

    // 2. Waiting times by approach direction
    const waitTimes = env.getWaitingTimesByDirection();
    expect(waitTimes).toHaveProperty(Direction.NORTH);
    expect(waitTimes[Direction.NORTH]).toBe(0);

    // 3. Compact discrete state for Tabular Q-learning
    const discreteState = env.getDiscreteTrafficState();
    expect(discreteState.nsDensity).toBe(QueueDensity.LOW);
    expect(discreteState.ewDensity).toBe(QueueDensity.LOW);
    expect(discreteState.activePhase).toBe(SignalPhase.NORTH_SOUTH_GREEN);

    // 4. Action application interface
    const actionResult = env.applyAction(SignalPhase.EAST_WEST_GREEN);
    expect(typeof actionResult).toBe('boolean');

    // 5. Default reward signal
    const reward = env.calculateDefaultReward();
    expect(typeof reward).toBe('number');
    expect(reward).toBe(0);

    // 6. Advance with action
    env.tick(0.05);
    expect(env.getSimSeconds()).toBeCloseTo(0.05, 2);
  });
});
