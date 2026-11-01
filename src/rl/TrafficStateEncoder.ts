import {
  Direction,
  EncodedTrafficState,
  EmergencyPriorityCategory,
  GreenDirection,
  QueueCategory,
  SignalPhase,
  TrafficObservation
} from '../types';
import type { TrafficEnvironment } from '../sim/TrafficEnvironment';
import type { Vehicle } from '../sim/Vehicle';

export const TOTAL_RL_STATES = 96; // 2 * 4 * 4 * 3 (legacy discrete state space)
export const DQN_OBSERVATION_DIM = 15; // 15-dimensional continuous normalized observation vector

/**
 * Traffic State Encoder for both continuous Deep Q-Network (15-dim normalized observation)
 * and legacy Tabular Q-Learning (96 discrete states).
 *
 * Feature normalization documentation:
 * [0] greenDirNS: 1.0 if North-South green, 0.0 if East-West green
 * [1] greenDirEW: 1.0 if East-West green, 0.0 if North-South green
 * [2] nsNormalizedQueue: queued vehicles on NS / 20.0, clamped in [0, 1]
 * [3] ewNormalizedQueue: queued vehicles on EW / 20.0, clamped in [0, 1]
 * [4] nsNormalizedWaitTime: mean waiting time of NS approaching vehicles / 60.0s, clamped in [0, 1]
 * [5] ewNormalizedWaitTime: mean waiting time of EW approaching vehicles / 60.0s, clamped in [0, 1]
 * [6] nsNormalizedSpeed: mean speed of NS approaching vehicles / 15.0 m/s (1.0 if empty), clamped in [0, 1]
 * [7] ewNormalizedSpeed: mean speed of EW approaching vehicles / 15.0 m/s (1.0 if empty), clamped in [0, 1]
 * [8] nsDensity: total approaching vehicles on NS / 20.0, clamped in [0, 1]
 * [9] ewDensity: total approaching vehicles on EW / 20.0, clamped in [0, 1]
 * [10] emergencyActive: 1.0 if an active emergency vehicle is approaching, 0.0 otherwise
 * [11] emergencyDirNS: 1.0 if active emergency vehicle is approaching on NS, 0.0 otherwise
 * [12] emergencyDirEW: 1.0 if active emergency vehicle is approaching on EW, 0.0 otherwise
 * [13] emergencyNormalizedDistance: distance to stop line / 100.0m (1.0 if none/far), clamped in [0, 1]
 * [14] greenPhaseElapsedNormalized: phase elapsed time / 30.0s, clamped in [0, 1]
 */
export class TrafficStateEncoder {
  /**
   * Produces a rich, normalized, 15-dimensional observation for the Deep Q-Network.
   */
  public static encodeObservation(env: TrafficEnvironment): TrafficObservation {
    const signal = env.getSignalController();
    const phase = signal.getPhase();
    const greenDirection = this.getGreenDirection(phase);
    const phaseElapsed = signal.getPhaseElapsed();

    const isNSGreen = greenDirection === 'NS' ? 1.0 : 0.0;
    const isEWGreen = greenDirection === 'EW' ? 1.0 : 0.0;

    const vehicles = env.getVehicles();
    const laneNetwork = env.getLaneNetwork();

    let nsQueueCount = 0;
    let ewQueueCount = 0;
    let nsApproachingCount = 0;
    let ewApproachingCount = 0;
    let nsTotalWaitSec = 0;
    let ewTotalWaitSec = 0;
    let nsTotalSpeed = 0;
    let ewTotalSpeed = 0;

    let activeEmergencyExists = false;
    let emergencyDirection: Direction | null = null;
    let minEmergencyDist = 100.0; // default 100m (normalized 1.0)

    for (const v of vehicles) {
      const lane = laneNetwork.getLane(v.laneId);
      if (!lane) continue;

      const isNS = lane.direction === Direction.NORTH || lane.direction === Direction.SOUTH;
      const distToStop = lane.stopLineDistance - v.s;

      // Approaching vehicles: upstream of stop line
      if (!v.hasPassedStopLine && distToStop >= 0) {
        if (isNS) {
          nsApproachingCount++;
          nsTotalWaitSec += v.waitingTimeSec;
          nsTotalSpeed += v.v;
          if (this.isVehicleQueued(v, lane.stopLineDistance)) {
            nsQueueCount++;
          }
        } else {
          ewApproachingCount++;
          ewTotalWaitSec += v.waitingTimeSec;
          ewTotalSpeed += v.v;
          if (this.isVehicleQueued(v, lane.stopLineDistance)) {
            ewQueueCount++;
          }
        }

        // Emergency vehicle check
        if (v.isEmergencyActive) {
          activeEmergencyExists = true;
          if (distToStop < minEmergencyDist) {
            minEmergencyDist = distToStop;
            emergencyDirection = lane.direction;
          }
        }
      }
    }

    const nsAvgWait = nsApproachingCount > 0 ? nsTotalWaitSec / nsApproachingCount : 0.0;
    const ewAvgWait = ewApproachingCount > 0 ? ewTotalWaitSec / ewApproachingCount : 0.0;

    // If approach is empty, default speed is free-flow (15.0 m/s -> normalized 1.0)
    const nsAvgSpeed = nsApproachingCount > 0 ? nsTotalSpeed / nsApproachingCount : 15.0;
    const ewAvgSpeed = ewApproachingCount > 0 ? ewTotalSpeed / ewApproachingCount : 15.0;

    // Normalizations (all bounded in [0, 1], finite numbers guaranteed)
    const nsNormQueue = Math.max(0.0, Math.min(1.0, nsQueueCount / 20.0));
    const ewNormQueue = Math.max(0.0, Math.min(1.0, ewQueueCount / 20.0));
    const nsNormWait = Math.max(0.0, Math.min(1.0, nsAvgWait / 60.0));
    const ewNormWait = Math.max(0.0, Math.min(1.0, ewAvgWait / 60.0));
    const nsNormSpeed = Math.max(0.0, Math.min(1.0, nsAvgSpeed / 15.0));
    const ewNormSpeed = Math.max(0.0, Math.min(1.0, ewAvgSpeed / 15.0));
    const nsDensity = Math.max(0.0, Math.min(1.0, nsApproachingCount / 20.0));
    const ewDensity = Math.max(0.0, Math.min(1.0, ewApproachingCount / 20.0));

    const emActive = activeEmergencyExists ? 1.0 : 0.0;
    const emIsNS =
      emergencyDirection === Direction.NORTH || emergencyDirection === Direction.SOUTH ? 1.0 : 0.0;
    const emIsEW =
      emergencyDirection === Direction.EAST || emergencyDirection === Direction.WEST ? 1.0 : 0.0;
    const emNormDist = Math.max(0.0, Math.min(1.0, minEmergencyDist / 100.0));
    const phaseElapsedNorm = Math.max(0.0, Math.min(1.0, phaseElapsed / 30.0));

    const vector: number[] = [
      isNSGreen,
      isEWGreen,
      nsNormQueue,
      ewNormQueue,
      nsNormWait,
      ewNormWait,
      nsNormSpeed,
      ewNormSpeed,
      nsDensity,
      ewDensity,
      emActive,
      emIsNS,
      emIsEW,
      emNormDist,
      phaseElapsedNorm
    ].map(val => (Number.isFinite(val) ? parseFloat(val.toFixed(4)) : 0.0));

    return {
      raw: {
        greenDirection,
        nsQueueLength: nsQueueCount,
        ewQueueLength: ewQueueCount,
        nsAvgWaitSec: parseFloat(nsAvgWait.toFixed(2)),
        ewAvgWaitSec: parseFloat(ewAvgWait.toFixed(2)),
        nsAvgSpeedMs: parseFloat(nsAvgSpeed.toFixed(2)),
        ewAvgSpeedMs: parseFloat(ewAvgSpeed.toFixed(2)),
        nsApproachingCount,
        ewApproachingCount,
        emergencyActive: activeEmergencyExists,
        emergencyDirection,
        emergencyDistanceMeters: parseFloat(minEmergencyDist.toFixed(1)),
        greenPhaseElapsedSec: parseFloat(phaseElapsed.toFixed(2))
      },
      vector
    };
  }

  /**
   * Classifies vehicle count into one of 4 discrete queue categories:
   * 0: 0 queued vehicles
   * 1: 1-3 queued vehicles
   * 2: 4-7 queued vehicles
   * 3: 8+ queued vehicles
   */
  public static categorizeQueue(count: number): QueueCategory {
    if (count <= 0) return 0;
    if (count <= 3) return 1;
    if (count <= 7) return 2;
    return 3;
  }

  /**
   * Checks whether a vehicle qualifies as queued at an approach:
   * Must be upstream of stop line, within 50m of stop line, and moving slowly (v < 0.5 m/s).
   */
  public static isVehicleQueued(vehicle: Vehicle, stopLineDistance: number): boolean {
    if (vehicle.hasPassedStopLine) return false;
    const distToStop = stopLineDistance - vehicle.s;
    return distToStop >= 0 && distToStop <= 50.0 && vehicle.v < 0.5;
  }

  /**
   * Calculates actual queue counts for North-South and East-West approaches.
   */
  public static calculateQueues(
    vehicles: Vehicle[],
    env: TrafficEnvironment
  ): { nsQueueCount: number; ewQueueCount: number } {
    let nsCount = 0;
    let ewCount = 0;
    const laneNetwork = env.getLaneNetwork();

    for (const v of vehicles) {
      const lane = laneNetwork.getLane(v.laneId);
      if (!lane) continue;

      if (this.isVehicleQueued(v, lane.stopLineDistance)) {
        if (lane.direction === Direction.NORTH || lane.direction === Direction.SOUTH) {
          nsCount++;
        } else {
          ewCount++;
        }
      }
    }

    return { nsQueueCount: nsCount, ewQueueCount: ewCount };
  }

  /**
   * Determines active emergency priority status from simulated traffic.
   * Deterministic rule:
   * - Evaluates active emergency vehicles (police/ambulance with isEmergencyActive = true).
   * - If emergency vehicles approach both directions simultaneously, the one closest to
   *   its stop line takes precedence. If tied, North-South takes precedence.
   */
  public static determineEmergencyPriority(
    vehicles: Vehicle[],
    env: TrafficEnvironment
  ): EmergencyPriorityCategory {
    const laneNetwork = env.getLaneNetwork();
    let closestNsDist = Infinity;
    let closestEwDist = Infinity;

    for (const v of vehicles) {
      if (!v.isEmergencyActive) continue;

      const lane = laneNetwork.getLane(v.laneId);
      if (!lane) continue;

      const distToStop = lane.stopLineDistance - v.s;
      // Active emergency approaching or waiting at intersection (on approach upstream of stop line)
      if (distToStop >= -5.0 && distToStop <= lane.stopLineDistance) {
        if (lane.direction === Direction.NORTH || lane.direction === Direction.SOUTH) {
          if (distToStop < closestNsDist) closestNsDist = distToStop;
        } else {
          if (distToStop < closestEwDist) closestEwDist = distToStop;
        }
      }
    }

    const hasNs = closestNsDist < Infinity;
    const hasEw = closestEwDist < Infinity;

    if (!hasNs && !hasEw) return EmergencyPriorityCategory.NONE;
    if (hasNs && !hasEw) return EmergencyPriorityCategory.NS_PRIORITY;
    if (!hasNs && hasEw) return EmergencyPriorityCategory.EW_PRIORITY;

    // Both approaches have active emergency vehicles: closest to stop line wins; tie breaks to NS
    return closestNsDist <= closestEwDist
      ? EmergencyPriorityCategory.NS_PRIORITY
      : EmergencyPriorityCategory.EW_PRIORITY;
  }

  /**
   * Checks whether the signal controller is currently in a valid green decision phase.
   */
  public static isAtValidGreenPhase(phase: SignalPhase): boolean {
    return (
      phase === SignalPhase.NORTH_SOUTH_GREEN ||
      phase === SignalPhase.EAST_WEST_GREEN
    );
  }

  /**
   * Determines green direction from current signal phase.
   * If in NS green, yellow, or clearance from NS: 'NS'.
   * If in EW green, yellow, or clearance from EW: 'EW'.
   */
  public static getGreenDirection(phase: SignalPhase): GreenDirection {
    switch (phase) {
      case SignalPhase.EAST_WEST_GREEN:
      case SignalPhase.EAST_WEST_YELLOW:
      case SignalPhase.ALL_RED_EW_TO_NS:
        return 'EW';

      case SignalPhase.NORTH_SOUTH_GREEN:
      case SignalPhase.NORTH_SOUTH_YELLOW:
      case SignalPhase.ALL_RED_NS_TO_EW:
      default:
        return 'NS';
    }
  }

  /**
   * Encodes state tuple into discrete index in [0, 95].
   */
  public static encodeIndex(
    greenDir: GreenDirection,
    nsCat: QueueCategory,
    ewCat: QueueCategory,
    emCat: EmergencyPriorityCategory
  ): number {
    const dirVal = greenDir === 'NS' ? 0 : 1;
    return dirVal * 48 + nsCat * 12 + ewCat * 3 + emCat;
  }

  /**
   * Decodes an integer state index [0, 95] back into state dimensions.
   */
  public static decodeIndex(index: number): {
    greenDirection: GreenDirection;
    nsQueueCategory: QueueCategory;
    ewQueueCategory: QueueCategory;
    emergencyCategory: EmergencyPriorityCategory;
  } {
    const bounded = Math.max(0, Math.min(TOTAL_RL_STATES - 1, Math.floor(index)));
    const dirVal = Math.floor(bounded / 48);
    const rem1 = bounded % 48;
    const nsCat = Math.floor(rem1 / 12) as QueueCategory;
    const rem2 = rem1 % 12;
    const ewCat = Math.floor(rem2 / 3) as QueueCategory;
    const emCat = (rem2 % 3) as EmergencyPriorityCategory;

    return {
      greenDirection: dirVal === 0 ? 'NS' : 'EW',
      nsQueueCategory: nsCat,
      ewQueueCategory: ewCat,
      emergencyCategory: emCat
    };
  }

  /**
   * Encodes current environment observation into EncodedTrafficState.
   */
  public static encode(env: TrafficEnvironment): EncodedTrafficState {
    const phase = env.getSignalController().getPhase();
    const greenDirection = this.getGreenDirection(phase);

    const vehicles = env.getVehicles();
    const { nsQueueCount, ewQueueCount } = this.calculateQueues(vehicles, env);

    const nsQueueCategory = this.categorizeQueue(nsQueueCount);
    const ewQueueCategory = this.categorizeQueue(ewQueueCount);
    const emergencyCategory = this.determineEmergencyPriority(vehicles, env);

    const stateIndex = this.encodeIndex(
      greenDirection,
      nsQueueCategory,
      ewQueueCategory,
      emergencyCategory
    );

    const emStr =
      emergencyCategory === EmergencyPriorityCategory.NONE
        ? 'NONE'
        : emergencyCategory === EmergencyPriorityCategory.NS_PRIORITY
        ? 'NS_PRIORITY'
        : 'EW_PRIORITY';

    const stateKey = `G:${greenDirection}|Qns:${nsQueueCategory}|Qew:${ewQueueCategory}|Em:${emStr}`;

    return {
      greenDirection,
      nsQueueCategory,
      ewQueueCategory,
      emergencyCategory,
      stateIndex,
      stateKey
    };
  }
}
