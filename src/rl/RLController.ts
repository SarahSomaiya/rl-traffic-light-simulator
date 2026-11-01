import {
  RLAction,
  RLControllerMode,
  SignalPhase,
  TrafficObservation
} from '../types';
import type { TrafficEnvironment } from '../sim/TrafficEnvironment';
import { TrafficStateEncoder } from './TrafficStateEncoder';
import { DQNAgent } from './DQNAgent';
import { ReplayBuffer } from './ReplayBuffer';
import { RewardCalculator, IntervalTrafficObservations } from './RewardCalculator';
import type { SwitchReason } from '../sim/SignalController';

export interface RLDecisionTelemetry {
  observation: TrafficObservation | null;
  action: RLAction | null;
  reward: number;
  qValues: [number, number]; // [holdQ, switchQ]
  isExploration: boolean;
  intervalElapsed: number;
  totalDecisionsCount: number;
  trainingSteps: number;
  recentLoss: number;
  replayBufferSize: number;
  epsilon: number;
  mode: RLControllerMode;
  holdActionCount?: number;
  switchActionCount?: number;
  lastSwitchReason?: SwitchReason;
  maxGreenInterventions?: number;
}

/**
 * Connects the TrafficEnvironment to the Deep Q-Network (DQN) Agent.
 * Enforces the fixed-timestep decision interval (default 5.0s),
 * clearance phase immunity, safe phase requests through SignalController,
 * experience collection into ReplayBuffer, and mini-batch network training.
 */
export class RLController {
  private env: TrafficEnvironment;
  private dqnAgent: DQNAgent;
  private replayBuffer: ReplayBuffer;
  private rewardCalculator: RewardCalculator;

  private mode: RLControllerMode = 'AUTOMATIC';
  private decisionTimer: number = 0;

  // Interval observation tracking
  private queueSamples: number[] = [];
  private nsQueueSamples: number[] = [];
  private ewQueueSamples: number[] = [];
  private lastTotalPassed: number = 0;
  private holdActionCount: number = 0;
  private switchActionCount: number = 0;
  private incrementalWaitAccumulator: number = 0;
  private emergencyWaitAccumulator: number = 0;
  private emergencyClearedAccumulator: number = 0;
  private actionSwitchedPhaseInInterval: boolean = false;

  // Transition state tracking
  private previousObservation: TrafficObservation | null = null;
  private previousAction: RLAction | null = null;
  private lastReward: number = 0;
  private lastIsExploration: boolean = false;
  private lastQValues: [number, number] = [0.0, 0.0];
  private totalDecisionsCount: number = 0;

  // Guard against concurrent overlapping training calls
  private isTrainingStepActive: boolean = false;
  private currentTrainingPromise: Promise<number> | null = null;

  constructor(
    env: TrafficEnvironment,
    dqnAgent: DQNAgent,
    replayBuffer?: ReplayBuffer,
    rewardCalculator?: RewardCalculator
  ) {
    this.env = env;
    this.dqnAgent = dqnAgent;
    this.replayBuffer = replayBuffer ?? new ReplayBuffer(dqnAgent.getHyperparameters().replayCapacity);
    this.rewardCalculator = rewardCalculator ?? new RewardCalculator();
  }

  public getMode(): RLControllerMode {
    return this.mode;
  }

  public setMode(mode: RLControllerMode): void {
    this.mode = mode;
    const signal = this.env.getSignalController();

    if (mode === 'AUTOMATIC') {
      // Restore standard automatic 20-second fixed-time cycling
      signal.setAutoCycle(true);
      this.dqnAgent.setEvaluationMode(false);
    } else if (mode === 'RL_AGENT') {
      // RL agent controls phases; disable default auto-cycle
      signal.setAutoCycle(false);
      this.dqnAgent.setEvaluationMode(false);
    } else if (mode === 'EVALUATION') {
      // Evaluation mode: greedy policy (epsilon = 0, no learning updates)
      signal.setAutoCycle(false);
      this.dqnAgent.setEvaluationMode(true);
    } else if (mode === 'TRAINING') {
      signal.setAutoCycle(false);
      this.dqnAgent.setEvaluationMode(false);
    }
  }

  public getPendingTrainingPromise(): Promise<number> | null {
    return this.currentTrainingPromise;
  }

  public getAgent(): DQNAgent {
    return this.dqnAgent;
  }

  public getDQNAgent(): DQNAgent {
    return this.dqnAgent;
  }

  public getReplayBuffer(): ReplayBuffer {
    return this.replayBuffer;
  }

  public getRewardCalculator(): RewardCalculator {
    return this.rewardCalculator;
  }

  /**
   * Ticks RL observation tracking and executes decision at decision boundaries.
   *
   * @param dt Fixed timestep duration in simulation seconds
   */
  public update(dt: number): void {
    if (this.mode === 'AUTOMATIC') return; // Fixed-time auto cycle handles itself

    // 1. Accumulate traffic samples during the current tick
    this.accumulateTickMetrics(dt);

    this.decisionTimer += dt;
    const decisionInterval = this.dqnAgent.getHyperparameters().decisionIntervalSec;

    // 2. Check if decision interval has elapsed
    if (this.decisionTimer >= decisionInterval) {
      const signal = this.env.getSignalController();
      const currentPhase = signal.getPhase();

      // Only take decisions during stable green phases (never interrupt yellow or all-red clearance)
      if (TrafficStateEncoder.isAtValidGreenPhase(currentPhase)) {
        this.executeDecisionStep();
        this.decisionTimer = 0;
      }
    }
  }

  /**
   * Samples queues and incremental waiting times for the current tick.
   */
  private accumulateTickMetrics(dt: number): void {
    const vehicles = this.env.getVehicles();
    const { nsQueueCount, ewQueueCount } = TrafficStateEncoder.calculateQueues(
      vehicles,
      this.env
    );
    this.queueSamples.push(nsQueueCount + ewQueueCount);
    this.nsQueueSamples.push(nsQueueCount);
    this.ewQueueSamples.push(ewQueueCount);

    // Accumulate incremental wait time during this tick
    for (const v of vehicles) {
      if (v.v < 0.5) {
        this.incrementalWaitAccumulator += dt;
        if (v.isEmergencyActive) {
          this.emergencyWaitAccumulator += dt;
        }
      }
    }
  }

  /**
   * Executes a discrete DQN decision step:
   * 1. Evaluates reward for the completed previous interval.
   * 2. Pushes transition (s, a, r, s', false) to ReplayBuffer.
   * 3. Triggers mini-batch training step if in training mode.
   * 4. Encodes current 15-dim observation.
   * 5. Selects action via DQN epsilon-greedy policy.
   * 6. Submits action safely through SignalController.
   */
  public executeDecisionStep(): void {
    const currentObservation = TrafficStateEncoder.encodeObservation(this.env);

    // 1. If we have a pending transition from previous step, close and store in replay
    if (this.previousObservation !== null && this.previousAction !== null) {
      const meanQueue =
        this.queueSamples.length > 0
          ? this.queueSamples.reduce((a, b) => a + b, 0) / this.queueSamples.length
          : 0;

      const meanNS = this.nsQueueSamples.length > 0 ? this.nsQueueSamples.reduce((a, b) => a + b, 0) / this.nsQueueSamples.length : 0;
      const meanEW = this.ewQueueSamples.length > 0 ? this.ewQueueSamples.reduce((a, b) => a + b, 0) / this.ewQueueSamples.length : 0;
      const queueImbalance = Math.abs(meanNS - meanEW);
      const currentPassed = this.env.getMetrics().totalVehiclesPassed;
      const vehiclesCleared = Math.max(0, currentPassed - this.lastTotalPassed);
      this.lastTotalPassed = currentPassed;

      const obs: IntervalTrafficObservations = {
        meanQueueCount: meanQueue,
        incrementalWaitSeconds: this.incrementalWaitAccumulator,
        actionSwitchedPhase: this.actionSwitchedPhaseInInterval,
        emergencyWaitingSeconds: this.emergencyWaitAccumulator,
        emergencyVehiclesCleared: this.emergencyClearedAccumulator,
        queueImbalance,
        vehiclesCleared
      };

      const breakdown = this.rewardCalculator.calculate(obs);
      this.lastReward = breakdown.totalReward;

      // Push experience transition into replay memory
      this.replayBuffer.push({
        state: this.previousObservation.vector,
        action: this.previousAction,
        reward: this.lastReward,
        nextState: currentObservation.vector,
        done: false
      });

      // 2. Mini-batch network training if in training mode
      if (
        this.mode === 'TRAINING' &&
        this.replayBuffer.size() >= this.dqnAgent.getHyperparameters().minReplaySize &&
        !this.isTrainingStepActive
      ) {
        this.isTrainingStepActive = true;
        const batch = this.replayBuffer.sample(this.dqnAgent.getHyperparameters().batchSize);
        this.currentTrainingPromise = this.dqnAgent.trainOnBatch(batch).finally(() => {
          this.isTrainingStepActive = false;
          this.currentTrainingPromise = null;
        });
      }
    }

    // Reset interval accumulators
    this.queueSamples = [];
    this.nsQueueSamples = [];
    this.ewQueueSamples = [];
    this.incrementalWaitAccumulator = 0;
    this.emergencyWaitAccumulator = 0;
    this.emergencyClearedAccumulator = 0;
    this.actionSwitchedPhaseInInterval = false;

    // 3. Select action from DQN for current observation
    const { action, isExploration, qValues } = this.dqnAgent.selectAction(currentObservation.vector);
    this.lastIsExploration = isExploration;
    this.lastQValues = qValues;
    this.totalDecisionsCount++;
    if (action === RLAction.HOLD_PHASE) {
      this.holdActionCount++;
    } else {
      this.switchActionCount++;
    }

    // 4. Submit action to signal state machine
    if (action === RLAction.REQUEST_SWITCH) {
      const signal = this.env.getSignalController();
      const currentPhase = signal.getPhase();

      const targetPhase =
        currentPhase === SignalPhase.NORTH_SOUTH_GREEN
          ? SignalPhase.EAST_WEST_GREEN
          : SignalPhase.NORTH_SOUTH_GREEN;

      const switchInitiated = signal.requestPhase(targetPhase, 'DQN_REQUEST');
      if (switchInitiated) {
        this.actionSwitchedPhaseInInterval = true;
      }
    }

    this.previousObservation = currentObservation;
    this.previousAction = action;
  }

  /**
   * Finalizes the last transition of an episode with done = true.
   */
  public finishEpisodeTransition(): void {
    if (this.previousObservation !== null && this.previousAction !== null) {
      const meanQueue =
        this.queueSamples.length > 0
          ? this.queueSamples.reduce((a, b) => a + b, 0) / this.queueSamples.length
          : 0;

      const obs: IntervalTrafficObservations = {
        meanQueueCount: meanQueue,
        incrementalWaitSeconds: this.incrementalWaitAccumulator,
        actionSwitchedPhase: this.actionSwitchedPhaseInInterval,
        emergencyWaitingSeconds: this.emergencyWaitAccumulator,
        emergencyVehiclesCleared: this.emergencyClearedAccumulator
      };

      const breakdown = this.rewardCalculator.calculate(obs);
      const currentObs = TrafficStateEncoder.encodeObservation(this.env);

      this.replayBuffer.push({
        state: this.previousObservation.vector,
        action: this.previousAction,
        reward: breakdown.totalReward,
        nextState: currentObs.vector,
        done: true
      });
    }

    this.resetIntervalTracking();
  }

  /**
   * Gathers live telemetry for UI dashboard and charts.
   */
  public getTelemetry(): RLDecisionTelemetry {
    return {
      observation: this.previousObservation,
      action: this.previousAction,
      reward: this.lastReward,
      qValues: this.lastQValues,
      isExploration: this.lastIsExploration,
      intervalElapsed: this.decisionTimer,
      totalDecisionsCount: this.totalDecisionsCount,
      trainingSteps: this.dqnAgent.getTrainingSteps(),
      recentLoss: this.dqnAgent.getRecentLoss(),
      replayBufferSize: this.replayBuffer.size(),
      epsilon: this.dqnAgent.getHyperparameters().epsilon,
      mode: this.mode,
      holdActionCount: this.holdActionCount,
      switchActionCount: this.switchActionCount,
      lastSwitchReason: this.env.getSignalController().getLastSwitchReason(),
      maxGreenInterventions: this.env.getSignalController().getMaxGreenInterventionsCount()
    };
  }

  /**
   * Resets internal interval accumulators and transition trackers (used on episode reset).
   */
  public resetActionCounts(): void {
    this.holdActionCount = 0;
    this.switchActionCount = 0;
  }

  public getActionCounts(): { hold: number; switch: number } {
    return { hold: this.holdActionCount, switch: this.switchActionCount };
  }

  public resetIntervalTracking(): void {
    this.decisionTimer = 0;
    this.queueSamples = [];
    this.nsQueueSamples = [];
    this.ewQueueSamples = [];
    this.lastTotalPassed = this.env.getMetrics().totalVehiclesPassed;
    this.incrementalWaitAccumulator = 0;
    this.emergencyWaitAccumulator = 0;
    this.emergencyClearedAccumulator = 0;
    this.actionSwitchedPhaseInInterval = false;
    this.previousObservation = null;
    this.previousAction = null;
    this.lastReward = 0;
    this.lastQValues = [0.0, 0.0];
  }
}
