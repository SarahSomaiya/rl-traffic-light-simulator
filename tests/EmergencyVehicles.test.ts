import { describe, it, expect } from 'vitest';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';
import { Spawner } from '../src/sim/Spawner';
import { LaneNetwork } from '../src/sim/Lane';
import { Direction, SignalPhase } from '../src/types';
import { getVehicleClassConfig } from '../src/sim/VehicleClasses';

describe('Emergency Vehicles, Fleet Diversity & Priority Interface', () => {
  it('1. should generate reproducible vehicle-type selection with a seeded spawner', () => {
    const network = new LaneNetwork();
    const spawner1 = new Spawner(network, {}, 12345);
    const spawner2 = new Spawner(network, {}, 12345);

    const types1 = Array.from({ length: 30 }, () => spawner1.sampleVehicleType());
    const types2 = Array.from({ length: 30 }, () => spawner2.sampleVehicleType());

    expect(types1).toEqual(types2);
    // Verify distribution contains multiple classes
    const uniqueTypes = new Set(types1);
    expect(uniqueTypes.size).toBeGreaterThanOrEqual(3);
  });

  it('2. should enforce safe spawning headways accounting for variable vehicle lengths', () => {
    const network = new LaneNetwork();
    const spawner = new Spawner(network, { minSafeSpawnGap: 14.0 });

    const ambulanceConfig = getVehicleClassConfig('ambulance'); // 5.65m long
    expect(ambulanceConfig.length).toBeGreaterThan(5.0);

    // Test with lead vehicle close to entry (s = 10.0m)
    const existing = [
      spawner.spawnSpecificVehicle('ambulance', [], Direction.SOUTH)!
    ];
    existing[0].s = 10.0; // Still in entry zone

    // Attempt to spawn another vehicle in same lane: should be blocked to prevent overlap!
    const isClear = spawner.isEntryClear('SOUTH_0', existing, 4.5);
    expect(isClear).toBe(false);

    // When lead vehicle has moved sufficiently far ahead (e.g. s = 30.0m)
    existing[0].s = 30.0;
    const isNowClear = spawner.isEntryClear('SOUTH_0', existing, 4.5);
    expect(isNowClear).toBe(true);
  });

  it('3. should support explicit spawning of emergency vehicles and report accurate metadata', () => {
    const env = new TrafficEnvironment({}, 42);

    // Spawning active ambulance
    const amb = env.spawnEmergencyVehicle('ambulance', Direction.SOUTH, true);
    expect(amb).not.toBeNull();
    expect(amb?.type).toBe('ambulance');
    expect(amb?.isEmergencyActive).toBe(true);
    expect(amb?.isEmergencyCapable).toBe(true);

    const emergencyInfo = env.getActiveEmergencyInfo();
    expect(emergencyInfo).not.toBeNull();
    expect(emergencyInfo?.vehicleId).toBe(amb?.id);
    expect(emergencyInfo?.type).toBe('ambulance');
    expect(emergencyInfo?.direction).toBe(Direction.SOUTH);
    expect(emergencyInfo?.distanceToStopLine).toBeGreaterThan(50.0);
  });

  it('4. should process safe emergency priority request without violating signal safety', () => {
    const env = new TrafficEnvironment({}, 42);
    const signal = env.getSignalController();

    // Set signal to East-West Green (South approach faces red)
    signal.requestPhase(SignalPhase.EAST_WEST_GREEN);
    // Step forward 10 seconds (minGreen 4.0s + yellow 3.0s + all-red 1.5s = 8.5s) so EW green is active
    for (let i = 0; i < 200; i++) {
      env.tick(0.05);
    }
    expect(signal.getPhase()).toBe(SignalPhase.EAST_WEST_GREEN);

    // Let EW green run for 4.5s (90 ticks) so it satisfies minimum green duration
    for (let i = 0; i < 90; i++) {
      env.tick(0.05);
    }
    expect(signal.getPhase()).toBe(SignalPhase.EAST_WEST_GREEN);

    // Spawn emergency ambulance on South approach
    env.spawnEmergencyVehicle('ambulance', Direction.SOUTH, true);

    // Request emergency priority for South approach
    const requested = env.requestEmergencyPriority();
    expect(requested).toBe(true);

    // The system MUST transition through East-West Yellow (clearance) first, NOT instantly turn green!
    expect(signal.getPhase()).toBe(SignalPhase.EAST_WEST_YELLOW);

    // Advance 3.1 seconds (yellow clearance)
    for (let i = 0; i < 62; i++) {
      env.tick(0.05);
    }
    // Must be in All-Red clearance buffer
    expect(signal.getPhase()).toBe(SignalPhase.ALL_RED_EW_TO_NS);

    // Advance 1.6 seconds (all-red clearance)
    for (let i = 0; i < 32; i++) {
      env.tick(0.05);
    }
    // Now safely in North-South Green!
    expect(signal.getPhase()).toBe(SignalPhase.NORTH_SOUTH_GREEN);
  });
});
