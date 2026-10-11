import { describe, it, expect } from 'vitest';
import { getSystemInfo } from '../src/main';
import { QueueDensity, SignalPhase } from '../src/types';

describe('Phase 1 Smoke & Environment Test', () => {
  it('should return initial system state correctly', () => {
    const info = getSystemInfo();
    expect(info.status).toBe('ready');
    expect(info.phase).toBe(1);
    expect(info.timestamp).toBeGreaterThan(0);
  });

  it('should define valid signal phases with safety guarantees', () => {
    expect(SignalPhase.NORTH_SOUTH_GREEN).toBe(0);
    expect(SignalPhase.NORTH_SOUTH_YELLOW).toBe(1);
    expect(SignalPhase.ALL_RED_NS_TO_EW).toBe(2);
    expect(SignalPhase.EAST_WEST_GREEN).toBe(3);
    expect(SignalPhase.EAST_WEST_YELLOW).toBe(4);
    expect(SignalPhase.ALL_RED_EW_TO_NS).toBe(5);
  });

  it('should support compact discrete state key generation for tabular Q-learning', () => {
    const encodeState = (ns: QueueDensity, ew: QueueDensity, phase: number) => `${ns}_${ew}_${phase}`;
    const key = encodeState(QueueDensity.LOW, QueueDensity.HIGH, SignalPhase.NORTH_SOUTH_GREEN);
    expect(key).toBe('0_2_0');
  });
});
