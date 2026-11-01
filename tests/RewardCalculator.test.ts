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

  it('4. should apply queue imbalance penalty when one approach is starved', () => {
    const calc = new RewardCalculator({
      queueWeight: 0.5,
      waitingTimeWeight: 0.05,
      imbalanceWeight: 0.35
    });

    // Balanced case: queueImbalance = 0
    const balanced = calc.calculate({
      meanQueueCount: 10,
      incrementalWaitSeconds: 20,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 0,
      queueImbalance: 0
    });
    // -(0.5 * 10) - (0.05 * 20) = -5.0 - 1.0 = -6.0
    expect(balanced.totalReward).toBe(-6.0);
    expect(balanced.imbalanceCost).toBe(0);

    // Starved case: queueImbalance = 10 (|10 - 0|)
    const starved = calc.calculate({
      meanQueueCount: 10,
      incrementalWaitSeconds: 20,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 0,
      queueImbalance: 10
    });
    // -6.0 - (0.35 * 10) = -6.0 - 3.5 = -9.5
    expect(starved.totalReward).toBe(-9.5);
    expect(starved.imbalanceCost).toBe(3.5);
  });

  it('5. should award throughput bonus for vehicles clearing intersection', () => {
    const calc = new RewardCalculator({
      queueWeight: 0.5,
      waitingTimeWeight: 0.05,
      throughputReward: 1.0
    });

    const res = calc.calculate({
      meanQueueCount: 4,
      incrementalWaitSeconds: 10,
      actionSwitchedPhase: false,
      emergencyWaitingSeconds: 0,
      emergencyVehiclesCleared: 0,
      queueImbalance: 0,
      vehiclesCleared: 5 // 5 vehicles completed traversal
    });

    // -(0.5 * 4) - (0.05 * 10) + (1.0 * 5) = -2.0 - 0.5 + 5.0 = +2.5
    expect(res.throughputBonus).toBe(5.0);
    expect(res.totalReward).toBe(2.5);
  });
});
