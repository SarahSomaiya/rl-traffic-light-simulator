import { Direction, EpisodeMetrics, EvaluationComparisonResult } from '../types';
import type { TrafficEnvironment } from '../sim/TrafficEnvironment';
import { DQNAgent } from './DQNAgent';
import { RLController } from './RLController';
import { RewardCalculator, IntervalTrafficObservations } from './RewardCalculator';
import { TrafficStateEncoder } from './TrafficStateEncoder';

/**
 * Runs fair, reproducible comparative evaluation benchmarks:
 * Baseline Fixed-Time Controller vs Trained Deep Q-Network (DQN) Policy
 * under identical seeds, traffic demand, and simulation durations.
 */
export class EvaluationRunner {
  private env: TrafficEnvironment;
  private agent: DQNAgent;
  private controller: RLController;
  private rewardCalculator: RewardCalculator;

  constructor(env: TrafficEnvironment, agent: DQNAgent, controller: RLController) {
    this.env = env;
    this.agent = agent;
    this.controller = controller;
    this.rewardCalculator = new RewardCalculator();
  }

  public getAgent(): DQNAgent {
    return this.agent;
  }

  /**
   * Evaluates the baseline (automatic 20-second fixed-time cycling).
   * Measures performance using the identical reward calculator and simulation clock.
   */
  public runBaselineEpisode(durationSec: number = 60.0, seed: number = 777): EpisodeMetrics {
    // 1. Reset environment with benchmark seed
    this.env.reset(seed);
    this.controller.setMode('AUTOMATIC');
    this.controller.resetIntervalTracking();
    this.controller.resetActionCounts();
    this.env.getSignalController().resetMaxGreenInterventions();

    const dt = 0.05;
    const totalTicks = Math.floor(durationSec / dt);
    const decisionTicks = Math.floor(5.0 / dt); // 5-second measurement windows

    let cumulativeReward = 0;
    let queueSamples: number[] = [];
    let nsQueueSamples: number[] = [];
    let ewQueueSamples: number[] = [];
    let incrementalWait = 0;
    let emergencyWait = 0;
    let previousPhase = this.env.getSignalController().getPhase();
    let lastTotalPassed = this.env.getMetrics().totalVehiclesPassed;

    for (let t = 0; t < totalTicks; t++) {
      this.env.tick(dt);

      // Sample queue & wait time during this tick for fair reward comparison
      const vehicles = this.env.getVehicles();
      const { nsQueueCount, ewQueueCount } = TrafficStateEncoder.calculateQueues(vehicles, this.env);
      queueSamples.push(nsQueueCount + ewQueueCount);
      nsQueueSamples.push(nsQueueCount);
      ewQueueSamples.push(ewQueueCount);

      for (const v of vehicles) {
        if (v.v < 0.5) {
          incrementalWait += dt;
          if (v.isEmergencyActive) {
            emergencyWait += dt;
          }
        }
      }

      // Check if 5-second interval elapsed
      if ((t + 1) % decisionTicks === 0) {
        const meanQ = queueSamples.length > 0
          ? queueSamples.reduce((a, b) => a + b, 0) / queueSamples.length
          : 0;
        const meanNS = nsQueueSamples.length > 0
          ? nsQueueSamples.reduce((a, b) => a + b, 0) / nsQueueSamples.length
          : 0;
        const meanEW = ewQueueSamples.length > 0
          ? ewQueueSamples.reduce((a, b) => a + b, 0) / ewQueueSamples.length
          : 0;

        const currentPassed = this.env.getMetrics().totalVehiclesPassed;
        const vehiclesCleared = Math.max(0, currentPassed - lastTotalPassed);
        lastTotalPassed = currentPassed;

        const currentPhase = this.env.getSignalController().getPhase();
        const switched = currentPhase !== previousPhase;

        const obs: IntervalTrafficObservations = {
          meanQueueCount: meanQ,
          incrementalWaitSeconds: incrementalWait,
          actionSwitchedPhase: switched,
          emergencyWaitingSeconds: emergencyWait,
          emergencyVehiclesCleared: 0,
          queueImbalance: Math.abs(meanNS - meanEW),
          vehiclesCleared
        };

        const breakdown = this.rewardCalculator.calculate(obs);
        cumulativeReward += breakdown.totalReward;

        queueSamples = [];
        nsQueueSamples = [];
        ewQueueSamples = [];
        incrementalWait = 0;
        emergencyWait = 0;
        previousPhase = currentPhase;
      }
    }

    const simMetrics = this.env.getMetrics();
    const waitTimes = this.env.getWaitingTimesByDirection();
    const nsWait = waitTimes[Direction.NORTH] + waitTimes[Direction.SOUTH];
    const ewWait = waitTimes[Direction.EAST] + waitTimes[Direction.WEST];
    const activeVehicles = this.env.getVehicles();
    let nsActive = 0;
    let ewActive = 0;
    for (const v of activeVehicles) {
      const lane = this.env.getLaneNetwork().getLane(v.laneId);
      if (lane) {
        if (lane.direction === Direction.NORTH || lane.direction === Direction.SOUTH) nsActive++;
        else ewActive++;
      }
    }

    const nsAvgWait = nsActive > 0 ? nsWait / nsActive : 0;
    const ewAvgWait = ewActive > 0 ? ewWait / ewActive : 0;

    const meanNSQueue = nsQueueSamples.length > 0
      ? nsQueueSamples.reduce((a, b) => a + b, 0) / nsQueueSamples.length
      : 0;
    const meanEWQueue = ewQueueSamples.length > 0
      ? ewQueueSamples.reduce((a, b) => a + b, 0) / ewQueueSamples.length
      : 0;

    return {
      episode: 0,
      totalReward: parseFloat(cumulativeReward.toFixed(2)),
      averageWaitSec: parseFloat(simMetrics.averageWaitTimeSec.toFixed(2)),
      nsAverageWaitSec: parseFloat(nsAvgWait.toFixed(2)),
      ewAverageWaitSec: parseFloat(ewAvgWait.toFixed(2)),
      vehiclesCleared: simMetrics.totalVehiclesPassed,
      meanQueue: simMetrics.currentQueueLength,
      nsMeanQueue: parseFloat(meanNSQueue.toFixed(1)),
      ewMeanQueue: parseFloat(meanEWQueue.toFixed(1)),
      durationSec,
      holdCount: 0,
      switchCount: 0,
      maxGreenInterventions: this.env.getSignalController().getMaxGreenInterventionsCount()
    };
  }

  /**
   * Evaluates the trained Deep Q-Network policy using pure greedy inference (epsilon = 0, no learning updates).
   */
  public runRLEpisode(durationSec: number = 60.0, seed: number = 777): EpisodeMetrics {
    // 1. Reset environment with identical benchmark seed
    this.env.reset(seed);
    this.controller.setMode('EVALUATION');
    this.controller.resetIntervalTracking();
    this.controller.resetActionCounts();
    this.env.getSignalController().resetMaxGreenInterventions();

    const dt = 0.05;
    const totalTicks = Math.floor(durationSec / dt);
    let cumulativeReward = 0;

    let nsQueueSamples: number[] = [];
    let ewQueueSamples: number[] = [];

    for (let t = 0; t < totalTicks; t++) {
      const prevTele = this.controller.getTelemetry();
      this.env.tick(dt);
      const currTele = this.controller.getTelemetry();

      const vehicles = this.env.getVehicles();
      const { nsQueueCount, ewQueueCount } = TrafficStateEncoder.calculateQueues(vehicles, this.env);
      nsQueueSamples.push(nsQueueCount);
      ewQueueSamples.push(ewQueueCount);

      if (currTele.totalDecisionsCount > prevTele.totalDecisionsCount) {
        cumulativeReward += currTele.reward;
      }
    }

    const simMetrics = this.env.getMetrics();
    const waitTimes = this.env.getWaitingTimesByDirection();
    const nsWait = waitTimes[Direction.NORTH] + waitTimes[Direction.SOUTH];
    const ewWait = waitTimes[Direction.EAST] + waitTimes[Direction.WEST];
    const activeVehicles = this.env.getVehicles();
    let nsActive = 0;
    let ewActive = 0;
    for (const v of activeVehicles) {
      const lane = this.env.getLaneNetwork().getLane(v.laneId);
      if (lane) {
        if (lane.direction === Direction.NORTH || lane.direction === Direction.SOUTH) nsActive++;
        else ewActive++;
      }
    }

    const nsAvgWait = nsActive > 0 ? nsWait / nsActive : 0;
    const ewAvgWait = ewActive > 0 ? ewWait / ewActive : 0;

    const meanNSQueue = nsQueueSamples.length > 0
      ? nsQueueSamples.reduce((a, b) => a + b, 0) / nsQueueSamples.length
      : 0;
    const meanEWQueue = ewQueueSamples.length > 0
      ? ewQueueSamples.reduce((a, b) => a + b, 0) / ewQueueSamples.length
      : 0;

    const finalTele = this.controller.getTelemetry();

    return {
      episode: 1,
      totalReward: parseFloat(cumulativeReward.toFixed(2)),
      averageWaitSec: parseFloat(simMetrics.averageWaitTimeSec.toFixed(2)),
      nsAverageWaitSec: parseFloat(nsAvgWait.toFixed(2)),
      ewAverageWaitSec: parseFloat(ewAvgWait.toFixed(2)),
      vehiclesCleared: simMetrics.totalVehiclesPassed,
      meanQueue: simMetrics.currentQueueLength,
      nsMeanQueue: parseFloat(meanNSQueue.toFixed(1)),
      ewMeanQueue: parseFloat(meanEWQueue.toFixed(1)),
      durationSec,
      holdCount: finalTele.holdActionCount,
      switchCount: finalTele.switchActionCount,
      maxGreenInterventions: this.env.getSignalController().getMaxGreenInterventionsCount()
    };
  }

  /**
   * Runs a complete head-to-head evaluation comparing Baseline vs Trained DQN.
   */
  public evaluate(durationSec: number = 60.0, seed: number = 777): EvaluationComparisonResult {
    const baseline = this.runBaselineEpisode(durationSec, seed);
    const rl = this.runRLEpisode(durationSec, seed);

    const baseWait = baseline.averageWaitSec > 0 ? baseline.averageWaitSec : 1.0;
    const waitChangePct = ((rl.averageWaitSec - baseWait) / baseWait) * 100;

    const baseClear = baseline.vehiclesCleared > 0 ? baseline.vehiclesCleared : 1;
    const clearChangePct = ((rl.vehiclesCleared - baseClear) / baseClear) * 100;

    return {
      baseline,
      rl,
      waitingTimeChangePercent: parseFloat(waitChangePct.toFixed(1)),
      throughputChangePercent: parseFloat(clearChangePct.toFixed(1)),
      episodesRun: 1
    };
  }
}
