/**
 * Core type definitions for RL Traffic Light Simulator.
 */

export enum SignalPhase {
  NORTH_SOUTH_GREEN = 0,
  NORTH_SOUTH_YELLOW = 1,
  ALL_RED_NS_TO_EW = 2,
  EAST_WEST_GREEN = 3,
  EAST_WEST_YELLOW = 4,
  ALL_RED_EW_TO_NS = 5
}

export enum Direction {
  NORTH = 'NORTH',
  SOUTH = 'SOUTH',
  EAST = 'EAST',
  WEST = 'WEST'
}

export enum QueueDensity {
  LOW = 0,    // 0-2 vehicles
  MEDIUM = 1, // 3-5 vehicles
  HIGH = 2    // 6+ vehicles
}

/**
 * Compact discrete state for Tabular Q-learning:
 * [NS_density, EW_density, current_green_phase]
 */
export interface DiscreteTrafficState {
  nsDensity: QueueDensity;
  ewDensity: QueueDensity;
  activePhase: SignalPhase.NORTH_SOUTH_GREEN | SignalPhase.EAST_WEST_GREEN;
}

export interface SimulationMetrics {
  totalVehiclesSpawned: number;
  totalVehiclesPassed: number;
  averageWaitTimeSec: number;
  maxWaitTimeSec: number;
  currentQueueLength: number;
  elapsedSimSeconds: number;
}

export type LightState = 'red' | 'yellow' | 'green';

export type CameraPreset = 'isometric' | 'overhead' | 'street';

export type VehicleType =
  | 'hatchback'
  | 'sedan'
  | 'suv'
  | 'taxi'
  | 'police'
  | 'ambulance'
  | 'van';

export interface VehicleClassConfig {
  type: VehicleType;
  displayName: string;
  length: number; // meters
  width: number;  // meters
  height: number; // meters
  maxSpeed: number; // m/s
  desiredAcceleration: number; // m/s^2
  comfortableDeceleration: number; // m/s^2
  minGap: number; // meters (s0)
  timeHeadway: number; // seconds (T)
  defaultColors: number[];
  isEmergencyCapable: boolean;
}

export interface SpeedLimitConfig {
  mainApproachKmh: number;      // Default 40 km/h
  residentialSideKmh: number;   // Default 30 km/h
  enforcementToleranceKmh: number; // Default 2 km/h
}

export interface SpeedCameraDefinition {
  id: string;
  direction: Direction;
  laneId: string;
  detectionDistance: number; // Distance s along lane
  roadSideOffset: number;    // Offset from center line for 3D placement
  worldX: number;
  worldZ: number;
  rotationY: number;
  speedLimitKmh: number;
}

export interface SpeedViolationRecord {
  id: string;
  timestamp: number;
  vehicleId: string;
  vehicleType: VehicleType;
  cameraId: string;
  measuredSpeedKmh: number;
  speedLimitKmh: number;
  excessSpeedKmh: number;
}

export interface EmergencyStatusInfo {
  vehicleId: string;
  type: VehicleType;
  isEmergencyActive: boolean;
  laneId: string;
  direction: Direction;
  distanceToStopLine: number;
  isWaitingAtRed: boolean;
}

export interface FleetDistributionMetrics {
  hatchback: number;
  sedan: number;
  suv: number;
  taxi: number;
  police: number;
  ambulance: number;
  van: number;
}
