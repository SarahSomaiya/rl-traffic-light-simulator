import { LaneNetwork } from './Lane';
import { Vehicle } from './Vehicle';
import { SignalController } from './SignalController';
import { Spawner } from './Spawner';
import { SpeedEnforcementManager } from './SpeedEnforcement';
import { DQNAgent } from '../rl/DQNAgent';
import { RLController } from '../rl/RLController';
import { TrainingManager } from '../rl/TrainingManager';
import {
  SimulationMetrics,
  Direction,
  LightState,
  FleetDistributionMetrics,
  EmergencyStatusInfo,
  SpeedViolationRecord,
  SpeedCameraDefinition,
  SignalPhase,
  DiscreteTrafficState,
  QueueDensity
} from '../types';

export interface TrafficEnvironmentConfig {
  fixedTimestep: number; // Physics tick rate (default 0.05s)
  roadHalfLength: number; // Boundary extent in meters (default 100m)
  stopLineOffset: number; // Stop line offset from center (default 11.5m)
}

export const DEFAULT_ENV_CONFIG: TrafficEnvironmentConfig = {
  fixedTimestep: 0.05,
  roadHalfLength: 100,
  stopLineOffset: 11.5
};

/**
 * Headless Traffic Simulation Environment.
 * Coordinates deterministic kinematics, vehicle fleet diversity, emergency vehicle status,
 * speed limit enforcement, and Deep Q-Network (DQN) integration.
 */
export class TrafficEnvironment {
  private config: TrafficEnvironmentConfig;
  private laneNetwork: LaneNetwork;
  private signalController: SignalController;
  private spawner: Spawner;
  private speedEnforcement: SpeedEnforcementManager;

  // Reinforcement Learning: Deep Q-Network components
  private dqnAgent: DQNAgent;
  private rlController: RLController;
  private trainingManager: TrainingManager;

  private vehicles: Vehicle[] = [];
  private totalSpawned: number = 0;
  private totalPassed: number = 0;
  private elapsedSimSeconds: number = 0;

  // Track positions prior to kinematics update for camera detection lines
  private prevPositions: Map<string, number> = new Map();

  // Persistent allocation caches for hot simulation paths
  private cachedSignalStates: Map<Direction, LightState> = new Map();
  private laneVehicleMap: Map<string, Vehicle[]> = new Map();
  private remainingVehiclesBuffer: Vehicle[] = [];

  // Simulation controls state
  private paused: boolean = false;
  private speedMultiplier: number = 1.0;
  private accumulator: number = 0;

  constructor(config: Partial<TrafficEnvironmentConfig> = {}, seed: number = 42) {
    this.config = { ...DEFAULT_ENV_CONFIG, ...config };
    this.laneNetwork = new LaneNetwork(this.config.roadHalfLength, this.config.stopLineOffset);
    this.signalController = new SignalController();
    this.spawner = new Spawner(this.laneNetwork, {}, seed);
    this.speedEnforcement = new SpeedEnforcementManager();

    this.dqnAgent = new DQNAgent({}, seed);
    this.rlController = new RLController(this, this.dqnAgent);
    this.trainingManager = new TrainingManager(this, this.dqnAgent, this.rlController);
  }

  public getLaneNetwork(): LaneNetwork {
    return this.laneNetwork;
  }

  public getDQNAgent(): DQNAgent {
    return this.dqnAgent;
  }

  public getRLAgent(): DQNAgent {
    return this.dqnAgent;
  }

  public getRLController(): RLController {
    return this.rlController;
  }

  public getTrainingManager(): TrainingManager {
    return this.trainingManager;
  }

  public getSignalController(): SignalController {
    return this.signalController;
  }

  public getSpawner(): Spawner {
    return this.spawner;
  }

  public getSpeedEnforcement(): SpeedEnforcementManager {
    return this.speedEnforcement;
  }

  public getVehicles(): Vehicle[] {
    return this.vehicles;
  }

  public getSimSeconds(): number {
    return this.elapsedSimSeconds;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public pause(): void {
    this.paused = true;
  }

  public play(): void {
    this.paused = false;
  }

  public togglePlayPause(): boolean {
    this.paused = !this.paused;
    return !this.paused;
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.1, Math.min(10.0, multiplier));
  }

  public getSignalStates(): Map<Direction, LightState> {
    this.cachedSignalStates.set(Direction.NORTH, this.signalController.getLightState(Direction.NORTH));
    this.cachedSignalStates.set(Direction.SOUTH, this.signalController.getLightState(Direction.SOUTH));
    this.cachedSignalStates.set(Direction.EAST, this.signalController.getLightState(Direction.EAST));
    this.cachedSignalStates.set(Direction.WEST, this.signalController.getLightState(Direction.WEST));
    return this.cachedSignalStates;
  }

  public getSpeedCameras(): SpeedCameraDefinition[] {
    return this.speedEnforcement.getCameras();
  }

  public getViolations(): SpeedViolationRecord[] {
    return this.speedEnforcement.getViolations();
  }

  /**
   * Spawns an emergency vehicle on demand (e.g. for testing or UI trigger).
   */
  public spawnEmergencyVehicle(
    type: 'ambulance' | 'police' = 'ambulance',
    direction: Direction = Direction.SOUTH,
    isEmergencyActive: boolean = true
  ): Vehicle | null {
    const v = this.spawner.spawnSpecificVehicle(type, this.vehicles, direction, isEmergencyActive);
    if (v) {
      this.vehicles.push(v);
      this.totalSpawned++;
    }
    return v;
  }

  /**
   * Safe Priority-Request Interface for emergency vehicles.
   * If an active emergency vehicle requests green on its approach, registers a safe
   * phase change with SignalController. The controller still enforces minimum green,
   * yellow clearance, and all-red buffer, preventing conflicting green movements.
   */
  public requestEmergencyPriority(): boolean {
    const activeEmergency = this.getActiveEmergencyInfo();
    if (!activeEmergency) return false;

    const isNorthSouth =
      activeEmergency.direction === Direction.NORTH ||
      activeEmergency.direction === Direction.SOUTH;

    const targetPhase = isNorthSouth
      ? SignalPhase.NORTH_SOUTH_GREEN
      : SignalPhase.EAST_WEST_GREEN;

    return this.signalController.requestPhase(targetPhase);
  }

  /**
   * Returns metadata about currently active emergency vehicles.
   */
  public getActiveEmergencyInfo(): EmergencyStatusInfo | null {
    const emergencyVehicle = this.vehicles.find(v => v.isEmergencyActive);
    if (!emergencyVehicle) return null;

    const lane = this.laneNetwork.getLane(emergencyVehicle.laneId);
    if (!lane) return null;

    const distToStop = Math.max(0, lane.stopLineDistance - emergencyVehicle.s);
    const light = this.signalController.getLightState(lane.direction);

    return {
      vehicleId: emergencyVehicle.id,
      type: emergencyVehicle.type,
      isEmergencyActive: true,
      laneId: emergencyVehicle.laneId,
      direction: lane.direction,
      distanceToStopLine: parseFloat(distToStop.toFixed(1)),
      isWaitingAtRed: light === 'red' && distToStop < 15.0 && emergencyVehicle.v < 0.5
    };
  }

  /**
   * Returns current count breakdown of active vehicles by type.
   */
  public getFleetDistribution(): FleetDistributionMetrics {
    const counts: FleetDistributionMetrics = {
      hatchback: 0,
      sedan: 0,
      suv: 0,
      taxi: 0,
      police: 0,
      ambulance: 0,
      van: 0
    };

    for (const v of this.vehicles) {
      if (counts[v.type] !== undefined) {
        counts[v.type]++;
      }
    }

    return counts;
  }

  /**
   * Advances the simulation using an accumulator of fixed timesteps.
   */
  public step(wallDelta: number): void {
    if (this.paused) return;

    // Cap wallDelta to prevent spiral of death when window loses focus
    const cappedDelta = Math.min(0.2, wallDelta);
    this.accumulator += cappedDelta * this.speedMultiplier;

    const dt = this.config.fixedTimestep;

    while (this.accumulator >= dt) {
      this.tick(dt);
      this.accumulator -= dt;
    }
  }

  /**
   * Executes a single discrete physics tick.
   */
  public tick(dt: number): void {
    this.elapsedSimSeconds += dt;

    // 1. Advance signal state machine
    this.signalController.update(dt);

    // 2. Spawn new vehicles
    const newVehicles = this.spawner.update(dt, this.vehicles);
    if (newVehicles.length > 0) {
      this.vehicles.push(...newVehicles);
      this.totalSpawned += newVehicles.length;
    }

    // 3. Cache previous positions for speed camera detection
    this.prevPositions.clear();
    for (const v of this.vehicles) {
      this.prevPositions.set(v.id, v.s);
    }

    // 4. Group vehicles by lane using persistent map to avoid per-tick heap allocations
    this.laneVehicleMap.forEach(arr => { arr.length = 0; });
    for (const v of this.vehicles) {
      let list = this.laneVehicleMap.get(v.laneId);
      if (!list) {
        list = [];
        this.laneVehicleMap.set(v.laneId, list);
      }
      list.push(v);
    }

    // 5. Update kinematics for each lane
    this.remainingVehiclesBuffer.length = 0;

    this.laneVehicleMap.forEach((laneVehicles, laneId) => {
      if (laneVehicles.length === 0) return;
      laneVehicles.sort((a, b) => b.s - a.s);

      const lane = this.laneNetwork.getLane(laneId);
      if (!lane) return;

      const lightState = this.signalController.getLightState(lane.direction);
      const laneSpeedLimitMs = this.speedEnforcement.getSpeedLimitMsForLane(laneId);

      for (let i = 0; i < laneVehicles.length; i++) {
        const vehicle = laneVehicles[i];
        const leadVehicle = i > 0 ? laneVehicles[i - 1] : null;

        vehicle.update(dt, leadVehicle, lane.stopLineDistance, lightState, laneSpeedLimitMs);

        // Check if vehicle has reached the end of the road
        if (vehicle.s < lane.length) {
          this.remainingVehiclesBuffer.push(vehicle);
        } else {
          this.totalPassed++;
        }
      }
    });

    this.vehicles = [...this.remainingVehiclesBuffer];

    // 6. Check speed cameras for violations
    this.speedEnforcement.checkSpeedViolations(
      this.vehicles,
      this.prevPositions,
      this.elapsedSimSeconds
    );

    // 7. Advance RL controller or training manager
    if (this.trainingManager.getState() === 'TRAINING') {
      this.trainingManager.step(dt);
    } else {
      this.rlController.update(dt);
    }
  }

  /**
   * Gathers live simulation metrics.
   */
  public getMetrics(): SimulationMetrics {
    let totalWait = 0;
    let maxWait = 0;
    let queueCount = 0;

    for (const v of this.vehicles) {
      totalWait += v.waitingTimeSec;
      if (v.waitingTimeSec > maxWait) {
        maxWait = v.waitingTimeSec;
      }
      if (v.v < 0.5) {
        queueCount++;
      }
    }

    const avgWait = this.vehicles.length > 0 ? totalWait / this.vehicles.length : 0;

    return {
      totalVehiclesSpawned: this.totalSpawned,
      totalVehiclesPassed: this.totalPassed,
      averageWaitTimeSec: avgWait,
      maxWaitTimeSec: maxWait,
      currentQueueLength: queueCount,
      elapsedSimSeconds: this.elapsedSimSeconds
    };
  }

  // =========================================================================
  // RL BACKEND READINESS INTERFACES
  // =========================================================================

  /**
   * Returns queued vehicle counts (v < 0.5 m/s) broken down by approach direction.
   */
  public getQueueLengthsByDirection(): Record<Direction, number> {
    const counts: Record<Direction, number> = {
      [Direction.NORTH]: 0,
      [Direction.SOUTH]: 0,
      [Direction.EAST]: 0,
      [Direction.WEST]: 0
    };

    for (const v of this.vehicles) {
      if (v.v < 0.5) {
        const lane = this.laneNetwork.getLane(v.laneId);
        if (lane) {
          counts[lane.direction]++;
        }
      }
    }

    return counts;
  }

  /**
   * Returns total vehicle waiting times (seconds) accumulated per approach direction.
   */
  public getWaitingTimesByDirection(): Record<Direction, number> {
    const times: Record<Direction, number> = {
      [Direction.NORTH]: 0,
      [Direction.SOUTH]: 0,
      [Direction.EAST]: 0,
      [Direction.WEST]: 0
    };

    for (const v of this.vehicles) {
      const lane = this.laneNetwork.getLane(v.laneId);
      if (lane) {
        times[lane.direction] += v.waitingTimeSec;
      }
    }

    return times;
  }

  /**
   * Returns compact discrete state representation for Q-learning:
   * [nsDensity, ewDensity, activePhase].
   */
  public getDiscreteTrafficState(): DiscreteTrafficState {
    const queues = this.getQueueLengthsByDirection();
    const nsTotal = queues[Direction.NORTH] + queues[Direction.SOUTH];
    const ewTotal = queues[Direction.EAST] + queues[Direction.WEST];

    const toDensity = (count: number): QueueDensity => {
      if (count <= 2) return QueueDensity.LOW;
      if (count <= 5) return QueueDensity.MEDIUM;
      return QueueDensity.HIGH;
    };

    const phase = this.signalController.getPhase();
    const activePhase = (
      phase === SignalPhase.EAST_WEST_GREEN ||
      phase === SignalPhase.EAST_WEST_YELLOW ||
      phase === SignalPhase.ALL_RED_EW_TO_NS
    )
      ? SignalPhase.EAST_WEST_GREEN
      : SignalPhase.NORTH_SOUTH_GREEN;

    return {
      nsDensity: toDensity(nsTotal),
      ewDensity: toDensity(ewTotal),
      activePhase
    };
  }

  /**
   * Applies an RL action (0 = North-South green, 1 = East-West green) through the safe signal controller.
   */
  public applyAction(action: 0 | 1 | SignalPhase.NORTH_SOUTH_GREEN | SignalPhase.EAST_WEST_GREEN): boolean {
    const isNorthSouth = action === 0 || (action as unknown) === SignalPhase.NORTH_SOUTH_GREEN;
    const targetPhase = isNorthSouth ? SignalPhase.NORTH_SOUTH_GREEN : SignalPhase.EAST_WEST_GREEN;

    return this.signalController.requestPhase(targetPhase);
  }

  /**
   * Calculates standard reinforcement learning reward signal:
   * Negative penalty for total waiting time and queue backlog.
   */
  public calculateDefaultReward(): number {
    let totalWait = 0;
    let queueCount = 0;

    for (const v of this.vehicles) {
      totalWait += v.waitingTimeSec;
      if (v.v < 0.5) queueCount++;
    }

    const penalty = 0.1 * totalWait + 1.0 * queueCount;
    return penalty === 0 ? 0 : -penalty;
  }

  /**
   * Resets simulation to initial state.
   * Note: Preserves learned Q-values in Q-table across episode resets.
   */
  public reset(seed: number = 42): void {
    this.vehicles = [];
    this.totalSpawned = 0;
    this.totalPassed = 0;
    this.elapsedSimSeconds = 0;
    this.accumulator = 0;
    this.prevPositions.clear();
    this.laneVehicleMap.forEach(arr => { arr.length = 0; });
    this.remainingVehiclesBuffer.length = 0;
    this.signalController.reset();
    this.spawner.reset(seed);
    this.speedEnforcement.reset();
    this.rlController.resetIntervalTracking();
  }

  /**
   * Explicitly resets the learned DQN neural network and replay buffer independently from simulation resets.
   */
  public resetModel(): void {
    this.dqnAgent.resetWeights();
    this.dqnAgent.resetEpsilon();
    this.rlController.getReplayBuffer().clear();
  }

  /**
   * Backward-compatible alias for resetModel.
   */
  public resetQTable(): void {
    this.resetModel();
  }
}
