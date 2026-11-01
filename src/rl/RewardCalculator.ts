export interface RewardWeights {
  queueWeight: number;          // Penalty per average queued vehicle (default 0.5)
  waitingTimeWeight: number;    // Penalty per second of incremental waiting time (default 0.05)
  imbalanceWeight: number;      // Penalty per vehicle queue imbalance |Q_NS - Q_EW| (default 0.35)
  throughputReward: number;     // Bonus per vehicle clearing intersection (default 1.0)
  switchPenalty: number;        // Penalty when switching phase to deter oscillation (default 0.25)
  emergencyWaitPenalty: number; // Penalty per second an active emergency vehicle waits (default 2.0)
  emergencyClearedReward: number; // Bonus when active emergency vehicle clears (default 5.0)
}

export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  queueWeight: 0.5,
  waitingTimeWeight: 0.05,
  imbalanceWeight: 0.35,
  throughputReward: 1.0,
  switchPenalty: 0.25,
  emergencyWaitPenalty: 2.0,
  emergencyClearedReward: 5.0
};

export interface IntervalTrafficObservations {
  meanQueueCount: number;         // Average queued vehicles during the interval
  incrementalWaitSeconds: number; // Sum of wait time accumulated by vehicles during the interval
  actionSwitchedPhase: boolean;   // Whether action initiated a phase switch
  emergencyWaitingSeconds: number;// Cumulative seconds active emergency vehicles waited at red
  emergencyVehiclesCleared: number; // Active emergency vehicles that cleared the intersection
  queueImbalance?: number;        // Average difference |Q_NS - Q_EW| during interval
  vehiclesCleared?: number;       // Vehicles completing traversal during interval
}

export interface RewardBreakdown {
  totalReward: number;
  queueCost: number;
  waitCost: number;
  imbalanceCost: number;
  throughputBonus: number;
  switchCost: number;
  emergencyModifier: number;
}

/**
 * Calculates deterministic, measurable traffic rewards for RL transitions.
 * Formula:
 * reward = -(queueWeight * meanQueue)
 *          -(waitingTimeWeight * incrementalWaitSeconds)
 *          -(imbalanceWeight * queueImbalance)
 *          +(throughputReward * vehiclesCleared)
 *          -(switchPenalty if actionSwitchedPhase)
 *          -(emergencyWaitPenalty * emergencyWaitingSeconds)
 *          +(emergencyClearedReward * emergencyVehiclesCleared)
 */
export class RewardCalculator {
  private weights: RewardWeights;

  constructor(weights: Partial<RewardWeights> = {}) {
    this.weights = { ...DEFAULT_REWARD_WEIGHTS, ...weights };
  }

  public getWeights(): RewardWeights {
    return { ...this.weights };
  }

  public setWeights(weights: Partial<RewardWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Computes the scalar numerical reward and component breakdown for an interval.
   */
  public calculate(obs: IntervalTrafficObservations): RewardBreakdown {
    const queueCost = this.weights.queueWeight * Math.max(0, obs.meanQueueCount);
    const waitCost = this.weights.waitingTimeWeight * Math.max(0, obs.incrementalWaitSeconds);
    const imbalanceCost = this.weights.imbalanceWeight * Math.max(0, obs.queueImbalance ?? 0);
    const throughputBonus = this.weights.throughputReward * Math.max(0, obs.vehiclesCleared ?? 0);
    const switchCost = obs.actionSwitchedPhase ? this.weights.switchPenalty : 0;

    const emergencyPenalty = this.weights.emergencyWaitPenalty * Math.max(0, obs.emergencyWaitingSeconds);
    const emergencyBonus = this.weights.emergencyClearedReward * Math.max(0, obs.emergencyVehiclesCleared);
    const emergencyModifier = emergencyBonus - emergencyPenalty;

    let total = -queueCost - waitCost - imbalanceCost + throughputBonus - switchCost + emergencyModifier;

    // Safety guard against NaN or non-finite values
    if (!isFinite(total)) {
      total = 0;
    }

    return {
      totalReward: parseFloat(total.toFixed(3)),
      queueCost: parseFloat(queueCost.toFixed(3)),
      waitCost: parseFloat(waitCost.toFixed(3)),
      imbalanceCost: parseFloat(imbalanceCost.toFixed(3)),
      throughputBonus: parseFloat(throughputBonus.toFixed(3)),
      switchCost: parseFloat(switchCost.toFixed(3)),
      emergencyModifier: parseFloat(emergencyModifier.toFixed(3))
    };
  }
}
