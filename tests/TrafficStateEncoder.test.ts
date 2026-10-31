import { describe, it, expect } from 'vitest';
import { TrafficStateEncoder, TOTAL_RL_STATES } from '../src/rl/TrafficStateEncoder';
import { EmergencyPriorityCategory, SignalPhase } from '../src/types';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';

describe('TrafficStateEncoder (96 Discrete States)', () => {
  it('1. should classify queue counts correctly across all threshold boundaries', () => {
    // 0: 0 queued vehicles
    expect(TrafficStateEncoder.categorizeQueue(0)).toBe(0);
    expect(TrafficStateEncoder.categorizeQueue(-1)).toBe(0);

    // 1: 1-3 queued vehicles
    expect(TrafficStateEncoder.categorizeQueue(1)).toBe(1);
    expect(TrafficStateEncoder.categorizeQueue(2)).toBe(1);
    expect(TrafficStateEncoder.categorizeQueue(3)).toBe(1);

    // 2: 4-7 queued vehicles
    expect(TrafficStateEncoder.categorizeQueue(4)).toBe(2);
    expect(TrafficStateEncoder.categorizeQueue(6)).toBe(2);
    expect(TrafficStateEncoder.categorizeQueue(7)).toBe(2);

    // 3: 8+ queued vehicles
    expect(TrafficStateEncoder.categorizeQueue(8)).toBe(3);
    expect(TrafficStateEncoder.categorizeQueue(15)).toBe(3);
    expect(TrafficStateEncoder.categorizeQueue(50)).toBe(3);
  });

  it('2. should correctly identify green directions for signal phases', () => {
    expect(TrafficStateEncoder.getGreenDirection(SignalPhase.NORTH_SOUTH_GREEN)).toBe('NS');
    expect(TrafficStateEncoder.getGreenDirection(SignalPhase.NORTH_SOUTH_YELLOW)).toBe('NS');
    expect(TrafficStateEncoder.getGreenDirection(SignalPhase.ALL_RED_NS_TO_EW)).toBe('NS');

    expect(TrafficStateEncoder.getGreenDirection(SignalPhase.EAST_WEST_GREEN)).toBe('EW');
    expect(TrafficStateEncoder.getGreenDirection(SignalPhase.EAST_WEST_YELLOW)).toBe('EW');
    expect(TrafficStateEncoder.getGreenDirection(SignalPhase.ALL_RED_EW_TO_NS)).toBe('EW');
  });

  it('3. should distinguish valid green decision phases from clearance intervals', () => {
    expect(TrafficStateEncoder.isAtValidGreenPhase(SignalPhase.NORTH_SOUTH_GREEN)).toBe(true);
    expect(TrafficStateEncoder.isAtValidGreenPhase(SignalPhase.EAST_WEST_GREEN)).toBe(true);

    expect(TrafficStateEncoder.isAtValidGreenPhase(SignalPhase.NORTH_SOUTH_YELLOW)).toBe(false);
    expect(TrafficStateEncoder.isAtValidGreenPhase(SignalPhase.ALL_RED_NS_TO_EW)).toBe(false);
    expect(TrafficStateEncoder.isAtValidGreenPhase(SignalPhase.EAST_WEST_YELLOW)).toBe(false);
    expect(TrafficStateEncoder.isAtValidGreenPhase(SignalPhase.ALL_RED_EW_TO_NS)).toBe(false);
  });

  it('4. should bi-directionally encode and decode all 96 discrete states deterministically', () => {
    expect(TOTAL_RL_STATES).toBe(96);
    const seenIndices = new Set<number>();

    const dirs: ('NS' | 'EW')[] = ['NS', 'EW'];
    const queues: (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];
    const emergencies = [
      EmergencyPriorityCategory.NONE,
      EmergencyPriorityCategory.NS_PRIORITY,
      EmergencyPriorityCategory.EW_PRIORITY
    ];

    for (const d of dirs) {
      for (const qNs of queues) {
        for (const qEw of queues) {
          for (const em of emergencies) {
            const index = TrafficStateEncoder.encodeIndex(d, qNs, qEw, em);
            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(96);
            expect(seenIndices.has(index)).toBe(false);
            seenIndices.add(index);

            // Decode index back and verify round-trip equality
            const decoded = TrafficStateEncoder.decodeIndex(index);
            expect(decoded.greenDirection).toBe(d);
            expect(decoded.nsQueueCategory).toBe(qNs);
            expect(decoded.ewQueueCategory).toBe(qEw);
            expect(decoded.emergencyCategory).toBe(em);
          }
        }
      }
    }

    expect(seenIndices.size).toBe(96);
  });

  it('5. should encode active emergency priority and resolve multiple emergencies deterministically', () => {
    const env = new TrafficEnvironment({}, 42);

    // Initial state: no vehicles -> NONE
    const encoded0 = TrafficStateEncoder.encode(env);
    expect(encoded0.emergencyCategory).toBe(EmergencyPriorityCategory.NONE);

    // Spawn emergency ambulance on South approach
    env.spawnEmergencyVehicle('ambulance', undefined, true);
    const encoded1 = TrafficStateEncoder.encode(env);
    expect(encoded1.emergencyCategory).toBe(EmergencyPriorityCategory.NS_PRIORITY);
  });

  it('6. should encode 15-dimensional continuous normalized observation for DQN', () => {
    const env = new TrafficEnvironment({}, 42);

    const obs = TrafficStateEncoder.encodeObservation(env);
    expect(obs.vector.length).toBe(15);

    // All features must be finite and normalized in [0, 1]
    obs.vector.forEach(val => {
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0.0);
      expect(val).toBeLessThanOrEqual(1.0);
    });

    // Initial state: NS green = 1.0, EW green = 0.0, no emergency = 0.0, dist = 1.0
    expect(obs.vector[0]).toBe(1.0); // greenDirNS
    expect(obs.vector[1]).toBe(0.0); // greenDirEW
    expect(obs.vector[10]).toBe(0.0); // emergencyActive
    expect(obs.vector[13]).toBe(1.0); // emergencyNormalizedDistance (none = 1.0)
  });

  it('7. should encode emergency vehicle metrics accurately into the observation vector', () => {
    const env = new TrafficEnvironment({}, 42);

    // Spawn emergency police car on South approach
    env.spawnEmergencyVehicle('police', undefined, true);

    const obs = TrafficStateEncoder.encodeObservation(env);
    expect(obs.vector[10]).toBe(1.0); // emergencyActive
    expect(obs.vector[11]).toBe(1.0); // emergencyDirNS
    expect(obs.vector[12]).toBe(0.0); // emergencyDirEW
    expect(obs.vector[13]).toBeLessThan(1.0); // distance normalized
  });
});
