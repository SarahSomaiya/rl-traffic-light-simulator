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
