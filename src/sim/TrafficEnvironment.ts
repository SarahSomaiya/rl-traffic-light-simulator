import { LaneNetwork } from './Lane';
import { Vehicle } from './Vehicle';
import { SignalController } from './SignalController';
import { Spawner } from './Spawner';
import { SimulationMetrics, Direction, LightState } from '../types';

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
 * Runs deterministic fixed-timestep traffic physics independently of rendering.
 */
export class TrafficEnvironment {
  private config: TrafficEnvironmentConfig;
  private laneNetwork: LaneNetwork;
  private signalController: SignalController;
  private spawner: Spawner;

  private vehicles: Vehicle[] = [];
  private totalSpawned: number = 0;
  private totalPassed: number = 0;
  private elapsedSimSeconds: number = 0;

  // Simulation controls state
  private paused: boolean = false;
  private speedMultiplier: number = 1.0;
  private accumulator: number = 0;

  constructor(config: Partial<TrafficEnvironmentConfig> = {}, seed: number = 42) {
    this.config = { ...DEFAULT_ENV_CONFIG, ...config };
    this.laneNetwork = new LaneNetwork(this.config.roadHalfLength, this.config.stopLineOffset);
    this.signalController = new SignalController();
    this.spawner = new Spawner(this.laneNetwork, {}, seed);
  }

  public getLaneNetwork(): LaneNetwork {
    return this.laneNetwork;
  }

  public getSignalController(): SignalController {
    return this.signalController;
  }

  public getVehicles(): Vehicle[] {
    return this.vehicles;
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
    const map = new Map<Direction, LightState>();
    map.set(Direction.NORTH, this.signalController.getLightState(Direction.NORTH));
    map.set(Direction.SOUTH, this.signalController.getLightState(Direction.SOUTH));
    map.set(Direction.EAST, this.signalController.getLightState(Direction.EAST));
    map.set(Direction.WEST, this.signalController.getLightState(Direction.WEST));
    return map;
  }

  /**
   * Advances the simulation using an accumulator of fixed timesteps.
   *
   * @param wallDelta Time elapsed in real-world seconds
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

    // 3. Group vehicles by lane and sort them by longitudinal distance s descending (furthest first)
    const laneMap = new Map<string, Vehicle[]>();
    for (const v of this.vehicles) {
      let list = laneMap.get(v.laneId);
      if (!list) {
        list = [];
        laneMap.set(v.laneId, list);
      }
      list.push(v);
    }

    // 4. Update kinematics for each lane
    const remainingVehicles: Vehicle[] = [];

    laneMap.forEach((laneVehicles, laneId) => {
      laneVehicles.sort((a, b) => b.s - a.s);

      const lane = this.laneNetwork.getLane(laneId);
      if (!lane) return;

      const lightState = this.signalController.getLightState(lane.direction);

      for (let i = 0; i < laneVehicles.length; i++) {
        const vehicle = laneVehicles[i];
        const leadVehicle = i > 0 ? laneVehicles[i - 1] : null;

        vehicle.update(dt, leadVehicle, lane.stopLineDistance, lightState);

        // Check if vehicle has reached the end of the road
        if (vehicle.s < lane.length) {
          remainingVehicles.push(vehicle);
        } else {
          this.totalPassed++;
        }
      }
    });

    this.vehicles = remainingVehicles;
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

  /**
   * Resets simulation to initial state.
   */
  public reset(seed: number = 42): void {
    this.vehicles = [];
    this.totalSpawned = 0;
    this.totalPassed = 0;
    this.elapsedSimSeconds = 0;
    this.accumulator = 0;
    this.signalController.reset();
    this.spawner.reset(seed);
  }
}
