import { describe, it, expect } from 'vitest';
import { SignalController } from '../src/sim/SignalController';
import { Direction, SignalPhase } from '../src/types';

describe('SignalController Phase Safety & Transitions', () => {
  it('should prevent conflicting green movements simultaneously', () => {
    const ctrl = new SignalController({ defaultGreenDuration: 10, yellowDuration: 3, allRedDuration: 2 });

    // Step through an entire cycle (30 seconds)
    const dt = 0.5;
    for (let t = 0; t < 60; t++) {
      ctrl.update(dt);

      const nsLight = ctrl.getLightState(Direction.NORTH);
      const ewLight = ctrl.getLightState(Direction.EAST);

      // Conflict assertion: both directions can NEVER be simultaneously green
      const bothGreen = nsLight === 'green' && ewLight === 'green';
      expect(bothGreen).toBe(false);

      // Conflict assertion: green in one direction requires red in opposing direction
      if (nsLight === 'green') {
        expect(ewLight).toBe('red');
      }
      if (ewLight === 'green') {
        expect(nsLight).toBe('red');
      }
    }
  });

  it('should enforce mandatory yellow and all-red clearance before opposing green', () => {
    const ctrl = new SignalController({
      defaultGreenDuration: 10,
      yellowDuration: 3.0,
      allRedDuration: 1.5,
      minGreenDuration: 2.0
    });

    expect(ctrl.getPhase()).toBe(SignalPhase.NORTH_SOUTH_GREEN);

    // Request EW Green after min green elapsed
    ctrl.update(3.0);
    const initiated = ctrl.requestPhase(SignalPhase.EAST_WEST_GREEN);
    expect(initiated).toBe(true);

    // Must immediately enter NS Yellow transition
    expect(ctrl.getPhase()).toBe(SignalPhase.NORTH_SOUTH_YELLOW);
    expect(ctrl.getLightState(Direction.NORTH)).toBe('yellow');
    expect(ctrl.getLightState(Direction.EAST)).toBe('red');

    // Step through 3 seconds of yellow
    ctrl.update(3.0);
    // Must now enter All-Red clearance interval
    expect(ctrl.getPhase()).toBe(SignalPhase.ALL_RED_NS_TO_EW);
    expect(ctrl.getLightState(Direction.NORTH)).toBe('red');
    expect(ctrl.getLightState(Direction.EAST)).toBe('red');

    // Step through 1.5 seconds of all-red clearance
    ctrl.update(1.5);
    // Finally enters EW Green
    expect(ctrl.getPhase()).toBe(SignalPhase.EAST_WEST_GREEN);
    expect(ctrl.getLightState(Direction.EAST)).toBe('green');
    expect(ctrl.getLightState(Direction.NORTH)).toBe('red');
  });

  it('should respect minimum green duration and not oscillate rapidly', () => {
    const ctrl = new SignalController({
      minGreenDuration: 5.0
    });

    // Try to request phase switch immediately at t = 0.5s
    ctrl.update(0.5);
    const switchedPrematurely = ctrl.requestPhase(SignalPhase.EAST_WEST_GREEN);

    // Switch should be queued/deferred, not initiated immediately
    expect(switchedPrematurely).toBe(false);
    expect(ctrl.getPhase()).toBe(SignalPhase.NORTH_SOUTH_GREEN);

    // Advance to 5.0 seconds
    ctrl.update(4.5);
    expect(ctrl.getPhase()).toBe(SignalPhase.NORTH_SOUTH_YELLOW);
  });
});
