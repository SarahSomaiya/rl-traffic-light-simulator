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

/**
 * Phase 4 & 5: Reinforcement Learning & Deep Q-Network (DQN) Types
 */
export enum RLAction {
  HOLD_PHASE = 0,
  REQUEST_SWITCH = 1
}

export type GreenDirection = 'NS' | 'EW';

export type QueueCategory = 0 | 1 | 2 | 3;

export enum EmergencyPriorityCategory {
  NONE = 0,
  NS_PRIORITY = 1,
  EW_PRIORITY = 2
}

/**
 * Rich numerical observation for Deep Q-Network.
 * 15 continuous and one-hot normalized features in [0, 1].
 */
export interface TrafficObservation {
  // Raw simulation metrics for debugging and HUD displays
  raw: {
    greenDirection: GreenDirection;
    nsQueueLength: number;
    ewQueueLength: number;
    nsAvgWaitSec: number;
    ewAvgWaitSec: number;
    nsAvgSpeedMs: number;
    ewAvgSpeedMs: number;
    nsApproachingCount: number;
    ewApproachingCount: number;
    emergencyActive: boolean;
    emergencyDirection: Direction | null;
    emergencyDistanceMeters: number;
    greenPhaseElapsedSec: number;
  };
  // Normalized feature vector matching neural network input shape (length 15)
  vector: number[];
}

export interface ReplayTransition {
  state: number[];
  action: RLAction;
  reward: number;
  nextState: number[];
  done: boolean;
}

export interface DQNHyperparameters {
  learningRate: number;        // default 0.001
  gamma: number;               // discount factor (default 0.95)
  epsilon: number;             // starting exploration rate (default 1.0)
  minEpsilon: number;          // minimum exploration rate (default 0.05)
  epsilonDecay: number;        // decay factor per episode (default 0.98)
  decisionIntervalSec: number; // seconds between RL decisions (default 5.0)
  batchSize: number;           // mini-batch size (default 32)
  replayCapacity: number;      // replay buffer capacity (default 10000)
  minReplaySize: number;       // min experiences before training starts (default 64)
  targetSyncInterval: number;  // training steps between target network syncs (default 10)
  hiddenUnits: number[];       // dense layer sizes, default [64, 64]
}

/**
 * Legacy discrete state representation retained for baseline compatibility.
 */
export interface EncodedTrafficState {
  greenDirection: GreenDirection;
  nsQueueCategory: QueueCategory;
  ewQueueCategory: QueueCategory;
  emergencyCategory: EmergencyPriorityCategory;
  stateIndex: number; // Discrete index in [0, 95]
  stateKey: string;   // Human-readable key e.g. "G:NS|Qns:1|Qew:2|Em:NONE"
}

export interface QLearningHyperparameters {
  alpha: number;
  gamma: number;
  epsilon: number;
  minEpsilon: number;
  epsilonDecay: number;
  decisionIntervalSec: number;
}

export type RLControllerMode = 'AUTOMATIC' | 'RL_AGENT' | 'TRAINING' | 'EVALUATION';

export interface EpisodeMetrics {
  episode: number;
  totalReward: number;
  movingAverageReward?: number;
  averageWaitSec: number;
  nsAverageWaitSec?: number;
  ewAverageWaitSec?: number;
  vehiclesCleared: number;
  meanQueue: number;
  nsMeanQueue?: number;
  ewMeanQueue?: number;
  durationSec: number;
  epsilonAtEnd?: number;
  replayBufferSize?: number;
  averageLoss?: number;
  trainingUpdatesCount?: number;
  holdCount?: number;
  switchCount?: number;
  maxGreenInterventions?: number;
}

export interface EvaluationComparisonResult {
  baseline: EpisodeMetrics;
  rl: EpisodeMetrics;
  waitingTimeChangePercent: number;
  throughputChangePercent: number;
  episodesRun: number;
}
