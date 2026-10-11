import { describe, it, expect } from 'vitest';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';

describe('TrafficEnvironment Integration & Controls (Headless)', () => {
  it('should run deterministic stepping with repeatable results given same seed', () => {
    const env1 = new TrafficEnvironment({}, 100);
    const env2 = new TrafficEnvironment({}, 100);

    for (let i = 0; i < 50; i++) {
      env1.step(0.1);
      env2.step(0.1);
    }

    const v1 = env1.getVehicles();
    const v2 = env2.getVehicles();

    expect(v1.length).toBe(v2.length);
    expect(v1.length).toBeGreaterThan(0);
    for (let i = 0; i < v1.length; i++) {
      expect(v1[i].id).toBe(v2[i].id);
      expect(v1[i].s).toBeCloseTo(v2[i].s, 3);
      expect(v1[i].v).toBeCloseTo(v2[i].v, 3);
    }
  });

  it('should freeze simulation time and vehicle movement when paused', () => {
    const env = new TrafficEnvironment({}, 42);

    // Run 5 seconds unpaused
    for (let i = 0; i < 50; i++) {
      env.step(0.1);
    }

    const vehiclesCount = env.getVehicles().length;
    expect(vehiclesCount).toBeGreaterThan(0);

    const snapshotPositions = env.getVehicles().map(v => v.s);

    // Pause simulation
    env.pause();
    expect(env.isPaused()).toBe(true);

    // Try stepping 5 seconds while paused
    for (let i = 0; i < 50; i++) {
      env.step(0.1);
    }

    // Vehicle positions and count must remain completely frozen
    expect(env.getVehicles().length).toBe(vehiclesCount);
    const afterPositions = env.getVehicles().map(v => v.s);
    for (let i = 0; i < snapshotPositions.length; i++) {
      expect(afterPositions[i]).toBe(snapshotPositions[i]);
    }

    // Resume simulation
    env.play();
    expect(env.isPaused()).toBe(false);
    env.step(0.2);
    // At least one vehicle should have advanced
    const advancedPositions = env.getVehicles().map(v => v.s);
    expect(advancedPositions.some((s, idx) => s > snapshotPositions[idx])).toBe(true);
  });

  it('should completely clear vehicles and metrics upon reset', () => {
    const env = new TrafficEnvironment({}, 42);

    for (let i = 0; i < 80; i++) {
      env.step(0.1);
    }

    expect(env.getVehicles().length).toBeGreaterThan(0);
    const metricsBefore = env.getMetrics();
    expect(metricsBefore.totalVehiclesSpawned).toBeGreaterThan(0);

    // Reset
    env.reset(42);

    expect(env.getVehicles().length).toBe(0);
    const metricsAfter = env.getMetrics();
    expect(metricsAfter.totalVehiclesSpawned).toBe(0);
    expect(metricsAfter.totalVehiclesPassed).toBe(0);
    expect(metricsAfter.elapsedSimSeconds).toBe(0);
  });
});
