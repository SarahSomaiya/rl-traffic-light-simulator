import { EpisodeMetrics } from '../types';
import { TrafficEnvironment } from '../sim/TrafficEnvironment';
import { DQNAgent } from './DQNAgent';
import { RLController } from './RLController';

export interface TrainingConfig {
  episodeDurationSec: number; // Duration of each training episode (default 60s)
  targetEpisodes: number;     // Target number of episodes to train (default 20)
  baseSeed: number;           // Seed for reproducible training
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  episodeDurationSec: 60.0,
  targetEpisodes: 20,
  baseSeed: 100
};

export type TrainingState = 'IDLE' | 'TRAINING' | 'PAUSED' | 'COMPLETED';

/**
 * Coordinates multi-episode Deep Q-Network training runs.
 * Manages episode lifecycles, metrics collection, replay buffer size,
 * loss tracking, moving average reward calculation, and epsilon decay
 * while preserving learned neural network weights between episodes.
 */
export class TrainingManager {
  private env: TrafficEnvironment;
  private agent: DQNAgent;
  private controller: RLController;
  private config: TrainingConfig;

  private state: TrainingState = 'IDLE';
  private currentEpisode: number = 0;
  private episodeSimElapsed: number = 0;
  private episodeCumulativeReward: number = 0;
  private episodeHistory: EpisodeMetrics[] = [];
  private movingAverageReward: number = 0;

  constructor(
    env: TrafficEnvironment,
    agent: DQNAgent,
    controller: RLController,
    config: Partial<TrainingConfig> = {}
  ) {
    this.env = env;
    this.agent = agent;
    this.controller = controller;
    this.config = { ...DEFAULT_TRAINING_CONFIG, ...config };
  }

  public getState(): TrainingState {
    return this.state;
  }

  public getCurrentEpisode(): number {
    return this.currentEpisode;
  }

  public getEpisodeProgress(): {
    currentEpisode: number;
    elapsedSec: number;
    totalSec: number;
    percent: number;
  } {
    const total = this.config.episodeDurationSec;
    const elapsed = this.episodeSimElapsed;
    const percent = Math.min(100, Math.floor((elapsed / total) * 100));
    return {
      currentEpisode: this.currentEpisode,
      elapsedSec: parseFloat(elapsed.toFixed(1)),
      totalSec: total,
      percent
    };
  }

  public getEpisodeHistory(): EpisodeMetrics[] {
    return [...this.episodeHistory];
  }

  public getCumulativeReward(): number {
    return parseFloat(this.episodeCumulativeReward.toFixed(2));
  }

  public getMovingAverageReward(): number {
    return parseFloat(this.movingAverageReward.toFixed(2));
  }

  /**
   * Starts a new training session or restarts from episode 1.
   */
  public startTraining(targetEpisodes: number = 20): void {
    this.config.targetEpisodes = targetEpisodes;
    this.currentEpisode = 1;
    this.episodeSimElapsed = 0;
    this.episodeCumulativeReward = 0;
    this.state = 'TRAINING';

    // Put controller in training mode and prepare fresh environment
    this.controller.setMode('TRAINING');
    this.startEpisode(this.currentEpisode);
  }

  public pauseTraining(): void {
    if (this.state === 'TRAINING') {
      this.state = 'PAUSED';
    }
  }

  public resumeTraining(): void {
    if (this.state === 'PAUSED') {
      this.state = 'TRAINING';
      this.controller.setMode('TRAINING');
    }
  }

  public stopTraining(): void {
    this.state = 'IDLE';
    this.controller.setMode('AUTOMATIC');
  }

  /**
   * Initializes a fresh episode: resets environment and timers WITHOUT clearing learned model weights.
   */
  private startEpisode(episodeNumber: number): void {
    const seed = this.config.baseSeed + episodeNumber * 17;
    this.env.reset(seed);
    this.controller.resetIntervalTracking();
    this.episodeSimElapsed = 0;
    this.episodeCumulativeReward = 0;
  }

  /**
   * Completes the current episode, records performance metrics, decays epsilon, and advances to next.
   */
  private finishEpisode(): void {
    const simMetrics = this.env.getMetrics();
    const tele = this.controller.getTelemetry();

    // Finalize last transition with done = true
    this.controller.finishEpisodeTransition();

    // Update moving average reward (window of up to last 5 episodes)
    const recentRewards = this.episodeHistory.slice(-4).map(m => m.totalReward);
    recentRewards.push(this.episodeCumulativeReward);
    this.movingAverageReward =
      recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;

    const episodeMetric: EpisodeMetrics = {
      episode: this.currentEpisode,
      totalReward: parseFloat(this.episodeCumulativeReward.toFixed(2)),
      movingAverageReward: parseFloat(this.movingAverageReward.toFixed(2)),
      averageWaitSec: parseFloat(simMetrics.averageWaitTimeSec.toFixed(2)),
      vehiclesCleared: simMetrics.totalVehiclesPassed,
      meanQueue: simMetrics.currentQueueLength,
      durationSec: this.config.episodeDurationSec,
      epsilonAtEnd: parseFloat(this.agent.getHyperparameters().epsilon.toFixed(3)),
      replayBufferSize: tele.replayBufferSize,
      averageLoss: tele.recentLoss,
      trainingUpdatesCount: tele.trainingSteps
    };

    this.episodeHistory.push(episodeMetric);

    // Decay exploration rate
    this.agent.decayEpsilon();

    if (this.currentEpisode >= this.config.targetEpisodes) {
      this.state = 'COMPLETED';
      this.controller.setMode('RL_AGENT'); // Transition to live RL agent mode
    } else {
      this.currentEpisode++;
      this.startEpisode(this.currentEpisode);
    }
  }

  /**
   * Steps the training simulation forward by dt seconds.
   * Note: Invoked by TrafficEnvironment.tick(dt) when state === 'TRAINING'.
   */
  public step(dt: number): void {
    if (this.state !== 'TRAINING') return;

    this.episodeSimElapsed += dt;

    // Advance controller tracking and decisions
    const prevTelemetry = this.controller.getTelemetry();
    this.controller.update(dt);
    const currTelemetry = this.controller.getTelemetry();

    // Track newly earned rewards
    if (currTelemetry.totalDecisionsCount > prevTelemetry.totalDecisionsCount) {
      this.episodeCumulativeReward += currTelemetry.reward;
    }

    // Check if episode duration reached
    if (this.episodeSimElapsed >= this.config.episodeDurationSec) {
      this.finishEpisode();
    }
  }

  /**
   * Runs training headlessly for a specified number of episodes.
   * Useful for rapid automated testing and evaluation without rendering.
   */
  public trainHeadless(episodes: number, episodeDurationSec: number = 60.0): EpisodeMetrics[] {
    this.config.episodeDurationSec = episodeDurationSec;
    this.startTraining(episodes);

    const dt = 0.05; // 20 Hz simulation ticks
    while (this.state === 'TRAINING') {
      // TrafficEnvironment.tick(dt) advances physics and automatically steps TrainingManager
      this.env.tick(dt);
    }

    return this.getEpisodeHistory();
  }

  /**
   * Resets the learned model weights and optimizer without altering environment state.
   */
  public resetModel(): void {
    this.agent.resetWeights();
    this.agent.resetEpsilon();
    this.controller.getReplayBuffer().clear();
    this.episodeHistory = [];
    this.movingAverageReward = 0;
  }

  /**
   * Backward-compatible alias for resetModel.
   */
  public resetQTable(): void {
    this.resetModel();
  }
}
