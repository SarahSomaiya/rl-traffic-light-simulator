import { LightState } from '../types';

export interface VehicleConfig {
  id: string;
  laneId: string;
  s?: number;
  v?: number;
  length?: number;
  width?: number;
  colorHex?: number;
  maxSpeed?: number;
}

export const VEHICLE_COLORS = [
  0x06b6d4, // Cyan
  0xef4444, // Red
  0xf8fafc, // Pearl White
  0x3b82f6, // Royal Blue
  0xf59e0b, // Amber Gold
  0x10b981, // Emerald Green
  0x64748b, // Slate Gray
  0x8b5cf6  // Violet
];

/**
 * Deterministic vehicle kinematics using the Intelligent Driver Model (IDM).
 * Manages safe car-following, stop-line braking at red lights, and smooth queueing.
 */
export class Vehicle {
  public readonly id: string;
  public laneId: string;

  // Longitudinal position along lane (meters)
  public s: number;
  // Speed (m/s)
  public v: number;
  // Current acceleration (m/s^2)
  public a: number = 0;

  // Dimensions
  public readonly length: number;
  public readonly width: number;
  public readonly colorHex: number;

  // Kinematic parameters
  public readonly maxSpeed: number; // v0 (default 11.0 m/s ~ 40 km/h)
  public readonly maxAcceleration: number = 2.5; // a (m/s^2)
  public readonly comfortableDeceleration: number = 3.2; // b (m/s^2)
  public readonly minGap: number = 2.5; // s0 (m)
  public readonly timeHeadway: number = 1.2; // T (seconds)

  // Status metrics
  public waitingTimeSec: number = 0;
  public hasPassedStopLine: boolean = false;

  constructor(config: VehicleConfig) {
    this.id = config.id;
    this.laneId = config.laneId;
    this.s = config.s ?? 0;
    this.v = config.v ?? 8.0;
    this.length = config.length ?? 4.2;
    this.width = config.width ?? 1.8;
    this.colorHex = config.colorHex ?? VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];
    this.maxSpeed = config.maxSpeed ?? 11.0;
  }

  /**
   * Updates vehicle kinematics for timestep dt given a leading vehicle and traffic signal.
   *
   * @param dt Timestep in seconds
   * @param leadVehicle Vehicle immediately ahead in the same lane (if any)
   * @param stopLineDistance Distance along the lane to the stop line
   * @param signalState Current light state ('green' | 'yellow' | 'red')
   */
  public update(
    dt: number,
    leadVehicle: Vehicle | null,
    stopLineDistance: number,
    signalState: LightState
  ): void {
    // Check if vehicle has crossed the stop line
    if (!this.hasPassedStopLine && this.s >= stopLineDistance) {
      this.hasPassedStopLine = true;
    }

    // Determine effective obstacles ahead (lead vehicle or red/yellow stop line)
    let minGapToObstacle = Infinity;
    let obstacleRelSpeed = 0;

    // 1. Car-following constraint (lead vehicle)
    if (leadVehicle && leadVehicle.s > this.s) {
      const physicalGap = leadVehicle.s - this.s - leadVehicle.length;
      if (physicalGap > 0) {
        minGapToObstacle = physicalGap;
        obstacleRelSpeed = this.v - leadVehicle.v;
      }
    }

    // 2. Traffic signal constraint (stop line acts as a virtual stationary obstacle)
    if (!this.hasPassedStopLine) {
      const distToStopLine = stopLineDistance - this.s;

      if (distToStopLine > 0) {
        let shouldStop = false;

        if (signalState === 'red') {
          shouldStop = true;
        } else if (signalState === 'yellow') {
          // Conservative dilemma zone: stop unless stopping requires harsh deceleration (> 4.5 m/s^2)
          const requiredDecel = (this.v * this.v) / (2 * Math.max(1.0, distToStopLine));
          shouldStop = requiredDecel <= 4.5;
        }

        if (shouldStop && distToStopLine < minGapToObstacle) {
          minGapToObstacle = distToStopLine;
          obstacleRelSpeed = this.v; // Virtual stationary obstacle has speed 0
        }
      }
    }

    // 3. Compute acceleration using the Intelligent Driver Model (IDM)
    const freeRoadTerm = 1 - Math.pow(this.v / this.maxSpeed, 4);

    let interactionTerm = 0;
    if (minGapToObstacle < 200) {
      const sStar =
        this.minGap +
        Math.max(
          0,
          this.v * this.timeHeadway +
            (this.v * obstacleRelSpeed) / (2 * Math.sqrt(this.maxAcceleration * this.comfortableDeceleration))
        );

      interactionTerm = Math.pow(sStar / Math.max(0.1, minGapToObstacle), 2);
    }

    // Target acceleration
    let targetAcc = this.maxAcceleration * (freeRoadTerm - interactionTerm);
    // Hard clamp to prevent unrealistically violent braking
    targetAcc = Math.max(-8.0, Math.min(this.maxAcceleration, targetAcc));
    this.a = targetAcc;

    // 4. Numerical integration (semi-implicit Euler) with clean standstill snap
    let nextV = this.v + this.a * dt;
    if (nextV <= 0.05 || (nextV < 0.3 && targetAcc < 0 && minGapToObstacle < 8.0)) {
      nextV = 0;
      this.a = 0;
    }
    this.v = Math.max(0, nextV);
    this.s += this.v * dt;

    // 5. Update waiting time metric (considered waiting when v < 0.25 m/s)
    if (this.v < 0.25) {
      this.waitingTimeSec += dt;
    }
  }
}
