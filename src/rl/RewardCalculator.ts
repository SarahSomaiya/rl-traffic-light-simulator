export interface RewardWeights {
  queueWeight: number;          // Default 1.0 per average queued vehicle
  waitingTimeWeight: number;    // Default 0.10 per second of incremental waiting time
  switchPenalty: number;        // Default 0.5 penalty when switching phase (deters oscillation)
  emergencyWaitPenalty: number; // Default 2.0 penalty per second an active emergency vehicle waits
  emergencyClearedReward: number; // Default 5.0 bonus when active emergency vehicle clears
}

export const DEFAULT_REWARD_WEIGHTS: RewardWeights = {
  queueWeight: 1.0,
  waitingTimeWeight: 0.10,
  switchPenalty: 0.5,
  emergencyWaitPenalty: 2.0,
  emergencyClearedReward: 5.0
};

export interface IntervalTrafficObservations {
  meanQueueCount: number;         // Average queued vehicles during the interval
  incrementalWaitSeconds: number; // Sum of wait time accumulated by vehicles during the interval
  actionSwitchedPhase: boolean;   // Whether action initiated a phase switch
  emergencyWaitingSeconds: number;// Cumulative seconds active emergency vehicles waited at red
  emergencyVehiclesCleared: number; // Active emergency vehicles that cleared the intersection
}

export interface RewardBreakdown {
  totalReward: number;
  queueCost: number;
  waitCost: number;
  switchCost: number;
  emergencyModifier: number;
}

/**
 * Calculates deterministic, measurable traffic rewards for RL transitions.
 * Formula:
 * reward = -(queueWeight * meanQueue)
 *          -(waitingTimeWeight * incrementalWaitSeconds)
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
    const switchCost = obs.actionSwitchedPhase ? this.weights.switchPenalty : 0;

    const emergencyPenalty = this.weights.emergencyWaitPenalty * Math.max(0, obs.emergencyWaitingSeconds);
    const emergencyBonus = this.weights.emergencyClearedReward * Math.max(0, obs.emergencyVehiclesCleared);
    const emergencyModifier = emergencyBonus - emergencyPenalty;

    let total = -queueCost - waitCost - switchCost + emergencyModifier;

    // Safety guard against NaN or non-finite values
    if (!isFinite(total)) {
      total = 0;
    }

    return {
      totalReward: parseFloat(total.toFixed(3)),
      queueCost: parseFloat(queueCost.toFixed(3)),
      waitCost: parseFloat(waitCost.toFixed(3)),
      switchCost: parseFloat(switchCost.toFixed(3)),
      emergencyModifier: parseFloat(emergencyModifier.toFixed(3))
    };
  }
}
