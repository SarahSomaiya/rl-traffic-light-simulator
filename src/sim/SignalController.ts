import { Direction, LightState, SignalPhase } from '../types';

export type SwitchReason =
  | 'INITIAL'
  | 'AUTO_CYCLE'
  | 'DQN_REQUEST'
  | 'MAX_GREEN_SAFEGUARD'
  | 'EMERGENCY_PRIORITY'
  | 'MANUAL_REQUEST';

export interface SignalTimingConfig {
  defaultGreenDuration: number; // Duration of green in auto mode (seconds)
  yellowDuration: number;       // Clearance yellow (seconds)
  allRedDuration: number;       // Clearance all-red buffer (seconds)
  minGreenDuration: number;     // Safety guard: minimum green time before allowing switch
  maxGreenDuration: number;     // Safety guard: maximum green duration before forced switch
}

export const DEFAULT_SIGNAL_TIMING: SignalTimingConfig = {
  defaultGreenDuration: 20.0,
  yellowDuration: 3.0,
  allRedDuration: 1.5,
  minGreenDuration: 4.0,
  maxGreenDuration: 25.0
};

/**
 * State machine managing safe traffic signal phases.
 * Guarantees conflict prevention (never simultaneous NS and EW greens),
 * enforces mandatory yellow clearance, all-red intervals, minimum green duration,
 * and maximum green safeguard to eliminate traffic starvation.
 */
export class SignalController {
  private phase: SignalPhase = SignalPhase.NORTH_SOUTH_GREEN;
  private phaseElapsed: number = 0;
  private config: SignalTimingConfig;
  private autoCycle: boolean = true;
  private pendingPhaseRequest: SignalPhase | null = null;
  private pendingRequestReason: SwitchReason = 'INITIAL';

  // Safeguard & telemetry tracking
  private lastSwitchReason: SwitchReason = 'INITIAL';
  private maxGreenInterventions: number = 0;

  constructor(config: Partial<SignalTimingConfig> = {}) {
    this.config = { ...DEFAULT_SIGNAL_TIMING, ...config };
  }

  public getPhase(): SignalPhase {
    return this.phase;
  }

  public getPhaseElapsed(): number {
    return this.phaseElapsed;
  }

  public isAutoCycle(): boolean {
    return this.autoCycle;
  }

  public setAutoCycle(auto: boolean): void {
    this.autoCycle = auto;
  }

  public getLastSwitchReason(): SwitchReason {
    return this.lastSwitchReason;
  }

  public getMaxGreenInterventionsCount(): number {
    return this.maxGreenInterventions;
  }

  public resetMaxGreenInterventions(): void {
    this.maxGreenInterventions = 0;
  }

  public getMaxGreenDuration(): number {
    return this.config.maxGreenDuration;
  }

  public setMaxGreenDuration(durationSec: number): void {
    this.config.maxGreenDuration = Math.max(this.config.minGreenDuration + 1.0, durationSec);
  }

  /**
   * Returns current light state for a given traffic approach direction.
   */
  public getLightState(direction: Direction): LightState {
    const isNorthSouth = direction === Direction.NORTH || direction === Direction.SOUTH;

    switch (this.phase) {
      case SignalPhase.NORTH_SOUTH_GREEN:
        return isNorthSouth ? 'green' : 'red';

      case SignalPhase.NORTH_SOUTH_YELLOW:
        return isNorthSouth ? 'yellow' : 'red';

      case SignalPhase.ALL_RED_NS_TO_EW:
      case SignalPhase.ALL_RED_EW_TO_NS:
        return 'red';

      case SignalPhase.EAST_WEST_GREEN:
        return isNorthSouth ? 'red' : 'green';

      case SignalPhase.EAST_WEST_YELLOW:
        return isNorthSouth ? 'red' : 'yellow';

      default:
        return 'red';
    }
  }

  /**
   * Advances the signal state machine by dt seconds.
   */
  public update(dt: number): void {
    this.phaseElapsed += dt;

    switch (this.phase) {
      case SignalPhase.NORTH_SOUTH_GREEN:
        // 1. Authoritative maximum-green safeguard (prevents starvation even under HOLD-only policies)
        if (this.phaseElapsed >= this.config.maxGreenDuration) {
          this.maxGreenInterventions++;
          this.lastSwitchReason = 'MAX_GREEN_SAFEGUARD';
          this.pendingPhaseRequest = null;
          this.transitionTo(SignalPhase.NORTH_SOUTH_YELLOW);
        }
        // 2. Fixed-time auto-cycle expiration
        else if (this.autoCycle && this.phaseElapsed >= this.config.defaultGreenDuration) {
          this.lastSwitchReason = 'AUTO_CYCLE';
          this.transitionTo(SignalPhase.NORTH_SOUTH_YELLOW);
        }
        // 3. Pending switch request (DQN, Emergency, or Manual) past minimum green duration
        else if (
          this.pendingPhaseRequest !== null &&
          this.pendingPhaseRequest !== SignalPhase.NORTH_SOUTH_GREEN &&
          this.phaseElapsed >= this.config.minGreenDuration
        ) {
          this.lastSwitchReason = this.pendingRequestReason || 'DQN_REQUEST';
          this.pendingPhaseRequest = null;
          this.transitionTo(SignalPhase.NORTH_SOUTH_YELLOW);
        }
        break;

      case SignalPhase.NORTH_SOUTH_YELLOW:
        if (this.phaseElapsed >= this.config.yellowDuration) {
          this.transitionTo(SignalPhase.ALL_RED_NS_TO_EW);
        }
        break;

      case SignalPhase.ALL_RED_NS_TO_EW:
        if (this.phaseElapsed >= this.config.allRedDuration) {
          this.pendingPhaseRequest = null;
          this.transitionTo(SignalPhase.EAST_WEST_GREEN);
        }
        break;

      case SignalPhase.EAST_WEST_GREEN:
        // 1. Authoritative maximum-green safeguard
        if (this.phaseElapsed >= this.config.maxGreenDuration) {
          this.maxGreenInterventions++;
          this.lastSwitchReason = 'MAX_GREEN_SAFEGUARD';
          this.pendingPhaseRequest = null;
          this.transitionTo(SignalPhase.EAST_WEST_YELLOW);
        }
        // 2. Fixed-time auto-cycle expiration
        else if (this.autoCycle && this.phaseElapsed >= this.config.defaultGreenDuration) {
          this.lastSwitchReason = 'AUTO_CYCLE';
          this.transitionTo(SignalPhase.EAST_WEST_YELLOW);
        }
        // 3. Pending switch request past minimum green duration
        else if (
          this.pendingPhaseRequest !== null &&
          this.pendingPhaseRequest !== SignalPhase.EAST_WEST_GREEN &&
          this.phaseElapsed >= this.config.minGreenDuration
        ) {
          this.lastSwitchReason = this.pendingRequestReason || 'DQN_REQUEST';
          this.pendingPhaseRequest = null;
          this.transitionTo(SignalPhase.EAST_WEST_YELLOW);
        }
        break;

      case SignalPhase.EAST_WEST_YELLOW:
        if (this.phaseElapsed >= this.config.yellowDuration) {
          this.transitionTo(SignalPhase.ALL_RED_EW_TO_NS);
        }
        break;

      case SignalPhase.ALL_RED_EW_TO_NS:
        if (this.phaseElapsed >= this.config.allRedDuration) {
          this.pendingPhaseRequest = null;
          this.transitionTo(SignalPhase.NORTH_SOUTH_GREEN);
        }
        break;
    }
  }

  private transitionTo(nextPhase: SignalPhase): void {
    this.phase = nextPhase;
    this.phaseElapsed = 0;
  }

  /**
   * Safely requests a switch to a desired green phase.
   * If already in that phase, clears pending request and returns true.
   * If currently in an opposing green phase, begins yellow -> all-red sequence
   * respecting minGreenDuration.
   */
  public requestPhase(
    targetGreenPhase: SignalPhase.NORTH_SOUTH_GREEN | SignalPhase.EAST_WEST_GREEN,
    reason: SwitchReason = 'DQN_REQUEST'
  ): boolean {
    if (this.phase === targetGreenPhase) {
      this.pendingPhaseRequest = null;
      return true;
    }

    this.pendingPhaseRequest = targetGreenPhase;
    this.pendingRequestReason = reason;

    // If currently in green and past minimum duration, initiate yellow transition immediately
    if (
      this.phase === SignalPhase.NORTH_SOUTH_GREEN &&
      this.phaseElapsed >= this.config.minGreenDuration
    ) {
      this.lastSwitchReason = reason;
      this.pendingPhaseRequest = null;
      this.transitionTo(SignalPhase.NORTH_SOUTH_YELLOW);
      return true;
    }

    if (
      this.phase === SignalPhase.EAST_WEST_GREEN &&
      this.phaseElapsed >= this.config.minGreenDuration
    ) {
      this.lastSwitchReason = reason;
      this.pendingPhaseRequest = null;
      this.transitionTo(SignalPhase.EAST_WEST_YELLOW);
      return true;
    }

    return false;
  }

  public reset(): void {
    this.phase = SignalPhase.NORTH_SOUTH_GREEN;
    this.phaseElapsed = 0;
    this.pendingPhaseRequest = null;
    this.pendingRequestReason = 'INITIAL';
    this.lastSwitchReason = 'INITIAL';
    this.maxGreenInterventions = 0;
  }
}
