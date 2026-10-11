import { Direction, LightState, SignalPhase } from '../types';

export interface SignalTimingConfig {
  defaultGreenDuration: number; // Duration of green in auto mode (seconds)
  yellowDuration: number; // Clearance yellow (seconds)
  allRedDuration: number; // Clearance all-red buffer (seconds)
  minGreenDuration: number; // Safety guard: minimum green time before allowing switch
}

export const DEFAULT_SIGNAL_TIMING: SignalTimingConfig = {
  defaultGreenDuration: 20.0,
  yellowDuration: 3.0,
  allRedDuration: 1.5,
  minGreenDuration: 4.0
};

/**
 * State machine managing safe traffic signal phases.
 * Guarantees conflict prevention (never simultaneous NS and EW greens),
 * enforces mandatory yellow clearance, all-red intervals, and minimum green duration.
 */
export class SignalController {
  private phase: SignalPhase = SignalPhase.NORTH_SOUTH_GREEN;
  private phaseElapsed: number = 0;
  private config: SignalTimingConfig;
  private autoCycle: boolean = true;
  private pendingPhaseRequest: SignalPhase | null = null;

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
        // Transition when default auto-timer expires or if a pending switch was requested
        if (
          (this.autoCycle && this.phaseElapsed >= this.config.defaultGreenDuration) ||
          (this.pendingPhaseRequest !== null &&
            this.pendingPhaseRequest !== SignalPhase.NORTH_SOUTH_GREEN &&
            this.phaseElapsed >= this.config.minGreenDuration)
        ) {
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
        if (
          (this.autoCycle && this.phaseElapsed >= this.config.defaultGreenDuration) ||
          (this.pendingPhaseRequest !== null &&
            this.pendingPhaseRequest !== SignalPhase.EAST_WEST_GREEN &&
            this.phaseElapsed >= this.config.minGreenDuration)
        ) {
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
   * If already in that phase, does nothing.
   * If currently in an opposing green phase, begins yellow -> all-red sequence
   * respecting minGreenDuration.
   */
  public requestPhase(targetGreenPhase: SignalPhase.NORTH_SOUTH_GREEN | SignalPhase.EAST_WEST_GREEN): boolean {
    if (this.phase === targetGreenPhase) {
      this.pendingPhaseRequest = null;
      return true;
    }

    this.pendingPhaseRequest = targetGreenPhase;

    // If currently in green and past minimum duration, initiate yellow transition immediately
    if (
      this.phase === SignalPhase.NORTH_SOUTH_GREEN &&
      this.phaseElapsed >= this.config.minGreenDuration
    ) {
      this.transitionTo(SignalPhase.NORTH_SOUTH_YELLOW);
      return true;
    }

    if (
      this.phase === SignalPhase.EAST_WEST_GREEN &&
      this.phaseElapsed >= this.config.minGreenDuration
    ) {
      this.transitionTo(SignalPhase.EAST_WEST_YELLOW);
      return true;
    }

    return false;
  }

  public reset(): void {
    this.phase = SignalPhase.NORTH_SOUTH_GREEN;
    this.phaseElapsed = 0;
    this.pendingPhaseRequest = null;
  }
}
