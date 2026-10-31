import {
  RLAction,
  QLearningHyperparameters
} from '../types';
import { TOTAL_RL_STATES } from './TrafficStateEncoder';

export const DEFAULT_HYPERPARAMETERS: QLearningHyperparameters = {
  alpha: 0.10,
  gamma: 0.95,
  epsilon: 1.00,
  minEpsilon: 0.05,
  epsilonDecay: 0.98,
  decisionIntervalSec: 5.0
};

export interface QTableEntry {
  stateIndex: number;
  holdQ: number;
  switchQ: number;
  bestAction: RLAction;
  visitCount: number;
}

/**
 * Tabular Q-Learning Agent.
 * Maintains a 96 x 2 Q-table mapping discrete traffic states to action values.
 */
export class QLearningAgent {
  private qTable: number[][]; // [stateIndex][action: 0 or 1]
  private visitCounts: number[]; // Number of times state was visited
  private config: QLearningHyperparameters;
  private isEvaluationMode: boolean = false;

  // PRNG state for deterministic exploration
  private seed: number;

  constructor(config: Partial<QLearningHyperparameters> = {}, seed: number = 42) {
    this.config = { ...DEFAULT_HYPERPARAMETERS, ...config };
    this.seed = seed;
    this.qTable = [];
    this.visitCounts = [];
    this.initTable();
  }

  private initTable(): void {
    this.qTable = [];
    this.visitCounts = [];
    for (let s = 0; s < TOTAL_RL_STATES; s++) {
      this.qTable.push([0.0, 0.0]);
      this.visitCounts.push(0);
    }
  }

  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  public getHyperparameters(): QLearningHyperparameters {
    return { ...this.config };
  }

  public setHyperparameters(params: Partial<QLearningHyperparameters>): void {
    this.config = { ...this.config, ...params };
    // Validate parameters
    this.config.alpha = Math.max(0.001, Math.min(1.0, this.config.alpha));
    this.config.gamma = Math.max(0.0, Math.min(1.0, this.config.gamma));
    this.config.epsilon = Math.max(0.0, Math.min(1.0, this.config.epsilon));
    this.config.minEpsilon = Math.max(0.0, Math.min(this.config.epsilon, this.config.minEpsilon));
    this.config.decisionIntervalSec = Math.max(1.0, Math.min(30.0, this.config.decisionIntervalSec));
  }

  public isEvaluation(): boolean {
    return this.isEvaluationMode;
  }

  public setEvaluationMode(enabled: boolean): void {
    this.isEvaluationMode = enabled;
  }

  public getQValues(stateIndex: number): [number, number] {
    const idx = Math.max(0, Math.min(TOTAL_RL_STATES - 1, stateIndex));
    const entry = this.qTable[idx] ?? [0.0, 0.0];
    return [entry[0], entry[1]];
  }

  public getBestAction(stateIndex: number): RLAction {
    const [holdQ, switchQ] = this.getQValues(stateIndex);
    // If values are equal, tie-break in favor of HOLD_PHASE to prevent unnecessary switching
    return switchQ > holdQ ? RLAction.REQUEST_SWITCH : RLAction.HOLD_PHASE;
  }

  /**
   * Selects an action for a state using epsilon-greedy policy.
   * In evaluation mode, epsilon is treated as 0 (pure exploitation).
   */
  public selectAction(stateIndex: number): { action: RLAction; isExploration: boolean } {
    const effectiveEpsilon = this.isEvaluationMode ? 0.0 : this.config.epsilon;

    if (this.random() < effectiveEpsilon) {
      // Exploration: pick random action
      const randomAction = this.random() < 0.5 ? RLAction.HOLD_PHASE : RLAction.REQUEST_SWITCH;
      return { action: randomAction, isExploration: true };
    } else {
      // Exploitation: pick greedy action
      return { action: this.getBestAction(stateIndex), isExploration: false };
    }
  }

  /**
   * Applies Tabular Q-learning update:
   * Q(s, a) = Q(s, a) + alpha * [reward + gamma * max_a' Q(s', a') - Q(s, a)]
   *
   * @param state Current state index [0, 95]
   * @param action Selected action (0 or 1)
   * @param reward Numerical reward received
   * @param nextState Next state index [0, 95]
   * @param isTerminal Whether this transition terminates the episode
   */
  public update(
    state: number,
    action: RLAction,
    reward: number,
    nextState: number,
    isTerminal: boolean = false
  ): number {
    if (this.isEvaluationMode) return 0; // Do not update in evaluation mode

    const s = Math.max(0, Math.min(TOTAL_RL_STATES - 1, state));
    const actIdx = action === RLAction.REQUEST_SWITCH ? 1 : 0;
    const currentQ = this.qTable[s][actIdx];

    let target = reward;
    if (!isTerminal) {
      const sNext = Math.max(0, Math.min(TOTAL_RL_STATES - 1, nextState));
      const nextQValues = this.qTable[sNext];
      const maxNextQ = Math.max(nextQValues[0], nextQValues[1]);
      target += this.config.gamma * maxNextQ;
    }

    const tdError = target - currentQ;
    const newQ = currentQ + this.config.alpha * tdError;

    // Numerical safety guard against NaN or Infinity
    this.qTable[s][actIdx] = isFinite(newQ) ? newQ : currentQ;
    this.visitCounts[s]++;

    return tdError;
  }

  /**
   * Decays exploration rate epsilon at the end of an episode.
   */
  public decayEpsilon(): number {
    this.config.epsilon = Math.max(
      this.config.minEpsilon,
      this.config.epsilon * this.config.epsilonDecay
    );
    return this.config.epsilon;
  }

  /**
   * Counts number of distinct states visited at least once.
   */
  public getVisitedStatesCount(): number {
    return this.visitCounts.filter(count => count > 0).length;
  }

  /**
   * Returns full policy summary for inspection and debugging.
   */
  public getPolicySummary(): QTableEntry[] {
    const summary: QTableEntry[] = [];
    for (let s = 0; s < TOTAL_RL_STATES; s++) {
      const [holdQ, switchQ] = this.qTable[s];
      summary.push({
        stateIndex: s,
        holdQ,
        switchQ,
        bestAction: switchQ > holdQ ? RLAction.REQUEST_SWITCH : RLAction.HOLD_PHASE,
        visitCount: this.visitCounts[s]
      });
    }
    return summary;
  }

  /**
   * Resets Q-table to all zeros and resets visit counts.
   */
  public resetQTable(): void {
    this.initTable();
  }

  /**
   * Resets exploration rate to initial value.
   */
  public resetEpsilon(): void {
    this.config.epsilon = DEFAULT_HYPERPARAMETERS.epsilon;
  }
}
