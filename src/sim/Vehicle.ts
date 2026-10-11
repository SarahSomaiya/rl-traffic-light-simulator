import { LightState, VehicleType, VehicleClassConfig } from '../types';
import { getVehicleClassConfig, kmhToMs } from './VehicleClasses';

export interface VehicleConfig {
  id: string;
  laneId: string;
  type?: VehicleType;
  s?: number;
  v?: number;
  length?: number;
  width?: number;
  height?: number;
  colorHex?: number;
  maxSpeed?: number;
  isEmergencyActive?: boolean;
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
 * Supports typed vehicle classes, configurable dynamics, road speed limits,
 * emergency vehicle status, stop-line braking, and safe queueing.
 */
export class Vehicle {
  public readonly id: string;
  public laneId: string;
  public readonly type: VehicleType;
  public readonly displayName: string;
  public readonly classConfig: VehicleClassConfig;

  // Longitudinal position along lane (meters)
  public s: number;
  // Speed (m/s)
  public v: number;
  // Current acceleration (m/s^2)
  public a: number = 0;

  // Physical Dimensions
  public readonly length: number;
  public readonly width: number;
  public readonly height: number;
  public readonly colorHex: number;

  // Kinematic parameters
  public readonly maxSpeed: number; // Max capability (m/s)
  public readonly maxAcceleration: number; // a (m/s^2)
  public readonly comfortableDeceleration: number; // b (m/s^2)
  public readonly minGap: number; // s0 (m)
  public readonly timeHeadway: number; // T (seconds)

  // Emergency status
  public readonly isEmergencyCapable: boolean;
  public isEmergencyActive: boolean;

  // Status metrics
  public waitingTimeSec: number = 0;
  public hasPassedStopLine: boolean = false;

  constructor(config: VehicleConfig) {
    this.id = config.id;
    this.laneId = config.laneId;
    this.type = config.type ?? 'sedan';
    this.classConfig = getVehicleClassConfig(this.type);

    this.displayName = this.classConfig.displayName;
    this.length = config.length ?? this.classConfig.length;
    this.width = config.width ?? this.classConfig.width;
    this.height = config.height ?? this.classConfig.height;

    // Pick color from config, class default colors, or fallback palette
    if (config.colorHex !== undefined) {
      this.colorHex = config.colorHex;
    } else if (this.classConfig.defaultColors.length > 0) {
      const idx = Math.floor(Math.random() * this.classConfig.defaultColors.length);
      this.colorHex = this.classConfig.defaultColors[idx];
    } else {
      this.colorHex = VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];
    }

    this.maxSpeed = config.maxSpeed ?? this.classConfig.maxSpeed;
    this.maxAcceleration = this.classConfig.desiredAcceleration;
    this.comfortableDeceleration = this.classConfig.comfortableDeceleration;
    this.minGap = this.classConfig.minGap;
    this.timeHeadway = this.classConfig.timeHeadway;

    this.isEmergencyCapable = this.classConfig.isEmergencyCapable;
    this.isEmergencyActive = (this.isEmergencyCapable && config.isEmergencyActive) || false;

    this.s = config.s ?? 0;
    this.v = config.v ?? Math.min(8.0, this.maxSpeed);
  }

  /**
   * Activates or deactivates emergency response mode if the vehicle is emergency-capable.
   */
  public setEmergencyActive(active: boolean): void {
    if (this.isEmergencyCapable) {
      this.isEmergencyActive = active;
    }
  }

  /**
   * Updates vehicle kinematics for timestep dt given a leading vehicle, traffic signal,
   * and applicable road speed limit.
   *
   * @param dt Timestep in seconds
   * @param leadVehicle Vehicle immediately ahead in the same lane (if any)
   * @param stopLineDistance Distance along the lane to the stop line
   * @param signalState Current light state ('green' | 'yellow' | 'red')
   * @param roadSpeedLimitMs Applicable road speed limit in m/s (default 40 km/h = 11.11 m/s)
   */
  public update(
    dt: number,
    leadVehicle: Vehicle | null,
    stopLineDistance: number,
    signalState: LightState,
    roadSpeedLimitMs: number = kmhToMs(40)
  ): void {
    // Check if vehicle has crossed the stop line
    if (!this.hasPassedStopLine && this.s >= stopLineDistance) {
      this.hasPassedStopLine = true;
    }

    // Determine target free-flow desired speed v0 respecting the applicable road speed limit
    let desiredSpeed = Math.min(this.maxSpeed, roadSpeedLimitMs);
    if (this.isEmergencyActive) {
      // Actively responding emergency vehicles may cruise up to their vehicle max capability
      desiredSpeed = this.maxSpeed;
    }
    // Prevent zero or negative desired speed
    desiredSpeed = Math.max(1.0, desiredSpeed);

    // Determine effective obstacles ahead (lead vehicle or red/yellow stop line)
    let minGapToObstacle = Infinity;
    let obstacleRelSpeed = 0;

    // 1. Car-following constraint (lead vehicle bumper-to-bumper)
    if (leadVehicle && leadVehicle.s > this.s) {
      const physicalGap = leadVehicle.s - this.s - leadVehicle.length;
      if (physicalGap > 0) {
        minGapToObstacle = physicalGap;
        obstacleRelSpeed = this.v - leadVehicle.v;
      }
    }

    // 2. Traffic signal constraint (stop line acts as a virtual stationary obstacle)
    // Note: Even emergency vehicles respect authoritative signal stop lines for safety
    if (!this.hasPassedStopLine) {
      const distToStopLine = stopLineDistance - this.s;

      if (distToStopLine > 0) {
        let shouldStop = false;

        if (signalState === 'red') {
          shouldStop = true;
        } else if (signalState === 'yellow') {
          // Dilemma zone: stop unless stopping requires harsh deceleration (> 4.5 m/s^2)
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
    const freeRoadTerm = 1 - Math.pow(this.v / desiredSpeed, 4);

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
    // Hard clamp to prevent violent or non-physical braking
    targetAcc = Math.max(-8.0, Math.min(this.maxAcceleration, targetAcc));
    this.a = isNaN(targetAcc) ? 0 : targetAcc;

    // 4. Numerical integration (semi-implicit Euler) with clean standstill snap
    let nextV = this.v + this.a * dt;
    if (nextV <= 0.05 || (nextV < 0.3 && this.a < 0 && minGapToObstacle < 8.0)) {
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
