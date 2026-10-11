import { Vehicle, VEHICLE_COLORS } from './Vehicle';
import { LaneNetwork } from './Lane';
import { Direction } from '../types';

export interface SpawnerConfig {
  spawnIntervalSec: number; // Mean interval between vehicle spawns per approach
  minSafeSpawnGap: number; // Minimum clearance required at lane entry (meters)
  initialSpeed: number; // Speed at spawn (m/s)
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  spawnIntervalSec: 4.0,
  minSafeSpawnGap: 12.0,
  initialSpeed: 8.5
};

/**
 * Controlled vehicle generator with safe entry headway checks and deterministic seed support.
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
    this.config = { ...DEFAULT_SPAWNER_CONFIG, ...config };
    this.seed = seed;
  }

  // Simple pseudo-random number generator for deterministic testing
  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Ticks spawn timers and spawns new vehicles when safe entry gap is available.
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

      // Jittered spawn interval (± 25%)
      const targetInterval = this.config.spawnIntervalSec * (0.8 + 0.4 * this.random());

      if (currentTimer >= targetInterval) {
        this.timers.set(dir, 0);

        // Pick one of the approach lanes (lane 0 or lane 1)
        const lanes = this.laneNetwork.getLanesByDirection(dir);
        if (lanes.length === 0) continue;

        const chosenLane = lanes[Math.floor(this.random() * lanes.length)];

        // Verify that entry area of chosenLane is clear
        const isEntryBlocked = existingVehicles.some(
          v => v.laneId === chosenLane.id && v.s < this.config.minSafeSpawnGap
        );

        if (!isEntryBlocked) {
          const colorHex = VEHICLE_COLORS[Math.floor(this.random() * VEHICLE_COLORS.length)];
          const vehicle = new Vehicle({
            id: `v_${this.nextVehicleId++}`,
            laneId: chosenLane.id,
            s: 0,
            v: this.config.initialSpeed,
            colorHex,
            maxSpeed: 10.5 + this.random() * 2.0
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
