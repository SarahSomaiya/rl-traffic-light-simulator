import { describe, it, expect } from 'vitest';
import { RewardCalculator } from '../src/rl/RewardCalculator';

describe('RewardCalculator', () => {
  it('1. should return zero reward for an empty intersection', () => {
    const calc = new RewardCalculator();
    const result = calc.calculate({
      meanQueueCount: 0,
      incrementalWaitSeconds: 0,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 0
    });

    expect(result.totalReward).toBe(0);
    expect(result.queueCost).toBe(0);
    expect(result.waitCost).toBe(0);
    expect(result.switchCost).toBe(0);
    expect(result.emergencyModifier).toBe(0);
  });

  it('2. should calculate correct reward for known queue and waiting times', () => {
    const calc = new RewardCalculator({
      queueWeight: 1.0,
      waitingTimeWeight: 0.10,
      switchPenalty: 0.5
    });

    // 4 mean queued vehicles, 20s incremental waiting, no switch
    // Expected: -(1.0 * 4) - (0.10 * 20) = -4.0 - 2.0 = -6.0
    const resNoSwitch = calc.calculate({
      meanQueueCount: 4,
      incrementalWaitSeconds: 20,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 0
    });
    expect(resNoSwitch.totalReward).toBe(-6.0);

    // With phase switch: adds -0.5 penalty -> -6.5
    const resSwitch = calc.calculate({
      meanQueueCount: 4,
      incrementalWaitSeconds: 20,
      actionSwitchedPhase: true,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 0
    });
    expect(resSwitch.totalReward).toBe(-6.5);
    expect(resSwitch.switchCost).toBe(0.5);
  });

  it('3. should account for active emergency vehicle delay and clearance bonus', () => {
    const calc = new RewardCalculator({
      emergencyWaitPenalty: 2.0,
      emergencyClearedReward: 5.0
    });

    // Active emergency vehicle delayed for 3 seconds: -2.0 * 3 = -6.0 penalty
    const resDelay = calc.calculate({
      meanQueueCount: 0,
      incrementalWaitSeconds: 0,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 3.0,
      emergencyVehiclesCleared: 0
    });
    expect(resDelay.emergencyModifier).toBe(-6.0);
    expect(resDelay.totalReward).toBe(-6.0);

    // Active emergency vehicle cleared intersection: +5.0 bonus
    const resCleared = calc.calculate({
      meanQueueCount: 0,
      incrementalWaitSeconds: 0,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 1
    });
    expect(resCleared.emergencyModifier).toBe(5.0);
    expect(resCleared.totalReward).toBe(5.0);
  });
});
