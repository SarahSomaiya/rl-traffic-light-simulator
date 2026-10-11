import { Vehicle } from './Vehicle';
import { LaneNetwork } from './Lane';
import { Direction, VehicleType } from '../types';
import { DEFAULT_SPAWN_WEIGHTS, getVehicleClassConfig } from './VehicleClasses';

export interface SpawnerConfig {
  spawnIntervalSec: number; // Mean interval between vehicle spawns per approach
  minSafeSpawnGap: number; // Base minimum clearance required at lane entry (meters)
  initialSpeed: number; // Initial speed at spawn (m/s)
  spawnWeights: Record<VehicleType, number>;
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  spawnIntervalSec: 3.5,
  minSafeSpawnGap: 14.0,
  initialSpeed: 8.5,
  spawnWeights: { ...DEFAULT_SPAWN_WEIGHTS }
};

/**
 * Controlled vehicle generator with class diversity, emergency vehicle support,
 * collision-free variable-length headway checks, and deterministic seed PRNG.
 */
export class Spawner {
  private config: SpawnerConfig;
  private laneNetwork: LaneNetwork;
  private nextVehicleId: number = 1;

  // Track elapsed time since last spawn attempt per direction
  private timers: Map<Direction, number> = new Map([
    [Direction.NORTH, 1.0],
    [Direction.SOUTH, 2.5],
    [Direction.EAST, 0.5],
    [Direction.WEST, 2.0]
  ]);

  // Deterministic PRNG state
  private seed: number;

  constructor(laneNetwork: LaneNetwork, config: Partial<SpawnerConfig> = {}, seed: number = 42) {
    this.laneNetwork = laneNetwork;
    this.config = {
      ...DEFAULT_SPAWNER_CONFIG,
      ...config,
      spawnWeights: config.spawnWeights ? { ...config.spawnWeights } : { ...DEFAULT_SPAWN_WEIGHTS }
    };
    this.seed = seed;
  }

  // Deterministic pseudo-random number generator
  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Samples a vehicle type based on configured probability weights.
   */
  public sampleVehicleType(): VehicleType {
    const weights = this.config.spawnWeights;
    const types = Object.keys(weights) as VehicleType[];
    const totalWeight = types.reduce((acc, t) => acc + (weights[t] ?? 0), 0);

    let rand = this.random() * (totalWeight > 0 ? totalWeight : 1);
    for (const t of types) {
      rand -= weights[t] ?? 0;
      if (rand <= 0) {
        return t;
      }
    }
    return 'sedan';
  }

  public getSpawnWeights(): Record<VehicleType, number> {
    return { ...this.config.spawnWeights };
  }

  public setSpawnWeights(weights: Partial<Record<VehicleType, number>>): void {
    this.config.spawnWeights = { ...this.config.spawnWeights, ...weights };
  }

  /**
   * Checks if lane entry has sufficient clearance for a vehicle of given length.
   */
  public isEntryClear(laneId: string, existingVehicles: Vehicle[], incomingLength: number): boolean {
    for (const v of existingVehicles) {
      if (v.laneId === laneId) {
        // Safe gap accounts for both incoming vehicle length and lead vehicle length
        const requiredGap = Math.max(this.config.minSafeSpawnGap, incomingLength + v.length + 2.5);
        if (v.s < requiredGap) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Explicitly spawns a specific vehicle type on demand (e.g. Ambulance or Police for tests/UI).
   */
  public spawnSpecificVehicle(
    type: VehicleType,
    existingVehicles: Vehicle[],
    direction: Direction = Direction.SOUTH,
    isEmergencyActive: boolean = false
  ): Vehicle | null {
    const lanes = this.laneNetwork.getLanesByDirection(direction);
    if (lanes.length === 0) return null;

    const classConfig = getVehicleClassConfig(type);

    // Find the first lane with a clear entry
    for (const lane of lanes) {
      if (this.isEntryClear(lane.id, existingVehicles, classConfig.length)) {
        const vehicle = new Vehicle({
          id: `v_${this.nextVehicleId++}`,
          laneId: lane.id,
          type,
          s: 0,
          v: Math.min(this.config.initialSpeed, classConfig.maxSpeed),
          isEmergencyActive
        });
        return vehicle;
      }
    }

    return null;
  }

  /**
   * Ticks spawn timers and spawns new vehicles according to weighted distribution.
   *
   * @param dt Timestep in seconds
   * @param existingVehicles Currently active vehicles in the environment
   * @returns Array of newly spawned vehicles
   */
  public update(dt: number, existingVehicles: Vehicle[]): Vehicle[] {
    const newVehicles: Vehicle[] = [];
    const directions = [Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST];

    for (const dir of directions) {
      const currentTimer = (this.timers.get(dir) ?? 0) + dt;

      // Jittered spawn interval (± 20%)
      const targetInterval = this.config.spawnIntervalSec * (0.8 + 0.4 * this.random());

      if (currentTimer >= targetInterval) {
        this.timers.set(dir, 0);

        const lanes = this.laneNetwork.getLanesByDirection(dir);
        if (lanes.length === 0) continue;

        const chosenLane = lanes[Math.floor(this.random() * lanes.length)];
        const sampledType = this.sampleVehicleType();
        const classConfig = getVehicleClassConfig(sampledType);

        // Verify that entry area is clear accounting for vehicle dimensions
        if (this.isEntryClear(chosenLane.id, existingVehicles, classConfig.length)) {
          // By default, police and ambulance spawn in normal patrol/transit mode (isEmergencyActive = false)
          // Emergency response mode can be explicitly triggered
          const vehicle = new Vehicle({
            id: `v_${this.nextVehicleId++}`,
            laneId: chosenLane.id,
            type: sampledType,
            s: 0,
            v: Math.min(this.config.initialSpeed, classConfig.maxSpeed),
            isEmergencyActive: false
          });

          newVehicles.push(vehicle);
        }
      } else {
        this.timers.set(dir, currentTimer);
      }
    }

    return newVehicles;
  }

  public reset(seed: number = 42): void {
    this.seed = seed;
    this.nextVehicleId = 1;
    this.timers.set(Direction.NORTH, 1.0);
    this.timers.set(Direction.SOUTH, 2.5);
    this.timers.set(Direction.EAST, 0.5);
    this.timers.set(Direction.WEST, 2.0);
  }
}
