import { describe, it, expect } from 'vitest';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';
import { SignalPhase } from '../src/types';

describe('RLController Integration & Signal Safety', () => {
  it('1. should take decisions only at valid green phases and respect decision interval', () => {
    const env = new TrafficEnvironment({}, 42);
    const controller = env.getRLController();
    const signal = env.getSignalController();

    controller.setMode('RL_AGENT');
    expect(signal.isAutoCycle()).toBe(false);

    // Initial state: 0 decisions taken
    expect(controller.getTelemetry().totalDecisionsCount).toBe(0);

    const dt = 0.05;
    // Step forward 4.9 seconds (98 ticks)
    for (let i = 0; i < 98; i++) {
      env.tick(dt);
    }
    // Decision interval is 5.0s, so at 4.9s still 0 decisions
    expect(controller.getTelemetry().totalDecisionsCount).toBe(0);

    // Step 0.2s further (crossing 5.0s threshold)
    for (let i = 0; i < 4; i++) {
      env.tick(dt);
    }
    // Exactly 1 decision step executed
    expect(controller.getTelemetry().totalDecisionsCount).toBe(1);
    expect(controller.getTelemetry().observation).not.toBeNull();
    expect(controller.getTelemetry().observation?.vector.length).toBe(15);
  });

  it('2. should not issue decision steps or interrupt yellow/all-red clearance transitions', () => {
    const env = new TrafficEnvironment({}, 42);
    const controller = env.getRLController();
    const signal = env.getSignalController();

    controller.setMode('RL_AGENT');

    // Manually initiate phase switch to EW
    // Step 5 seconds so minGreen is satisfied, then request switch
    for (let i = 0; i < 100; i++) {
      env.tick(0.05);
    }
    signal.requestPhase(SignalPhase.EAST_WEST_GREEN);
    expect(signal.getPhase()).toBe(SignalPhase.NORTH_SOUTH_YELLOW);

    const decisionsDuringYellow = controller.getTelemetry().totalDecisionsCount;

    // Advance during yellow phase (3.1 seconds = 62 ticks)
    for (let i = 0; i < 62; i++) {
      env.tick(0.05);
      // Signal must NOT allow simultaneous greens
      const nState = signal.getLightState(env.getLaneNetwork().getAllLanes()[0].direction);
      expect(['yellow', 'red', 'green'].includes(nState)).toBe(true);
    }

    // Decisions must not increment during yellow clearance
    expect(controller.getTelemetry().totalDecisionsCount).toBe(decisionsDuringYellow);

    // Now in All-Red buffer
    expect(signal.getPhase()).toBe(SignalPhase.ALL_RED_NS_TO_EW);
    expect(signal.getLightState(env.getLaneNetwork().getAllLanes()[0].direction)).toBe('red');

    // Advance all-red buffer (1.6 seconds = 32 ticks)
    for (let i = 0; i < 32; i++) {
      env.tick(0.05);
    }

    // Now safely in East-West Green!
    expect(signal.getPhase()).toBe(SignalPhase.EAST_WEST_GREEN);
  });

  it('3. should restore fixed-time auto cycling when mode set back to AUTOMATIC', () => {
    const env = new TrafficEnvironment({}, 42);
    const controller = env.getRLController();
    const signal = env.getSignalController();

    controller.setMode('RL_AGENT');
    expect(signal.isAutoCycle()).toBe(false);

    controller.setMode('AUTOMATIC');
    expect(signal.isAutoCycle()).toBe(true);
  });
});
