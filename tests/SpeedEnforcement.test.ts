import { describe, it, expect } from 'vitest';
import { SpeedEnforcementManager } from '../src/sim/SpeedEnforcement';
import { Vehicle } from '../src/sim/Vehicle';
import { kmhToMs } from '../src/sim/VehicleClasses';

describe('Speed Enforcement & Camera Detection (Headless)', () => {
  it('should detect a vehicle crossing the detection line and verify tolerance threshold', () => {
    const manager = new SpeedEnforcementManager({
      mainApproachKmh: 40.0,
      enforcementToleranceKmh: 2.0 // threshold = 42.0 km/h
    });

    const cameras = manager.getCameras();
    const southCam = cameras.find(c => c.id === 'cam_south_01')!;
    expect(southCam).toBeDefined();
    expect(southCam.detectionDistance).toBe(40.0);

    // Vehicle 1: driving within speed limit (38 km/h = 10.55 m/s)
    const vCompliant = new Vehicle({
      id: 'v_safe',
      laneId: 'SOUTH_0',
      type: 'sedan',
      s: 41.0,
      v: kmhToMs(38)
    });

    // Vehicle 2: driving within tolerance (41 km/h = 11.39 m/s, <= 42 km/h threshold)
    const vWithinTolerance = new Vehicle({
      id: 'v_tolerance',
      laneId: 'SOUTH_0',
      type: 'hatchback',
      s: 41.0,
      v: kmhToMs(41)
    });

    // Vehicle 3: speeding over threshold (49 km/h = 13.61 m/s, > 42 km/h)
    const vSpeeding = new Vehicle({
      id: 'v_speeder',
      laneId: 'SOUTH_0',
      type: 'suv',
      s: 41.0,
      v: kmhToMs(49)
    });

    // Previous positions were before the camera line (s = 39.0m)
    const prevPositions = new Map<string, number>([
      ['v_safe', 39.0],
      ['v_tolerance', 39.0],
      ['v_speeder', 39.0]
    ]);

    const violations = manager.checkSpeedViolations(
      [vCompliant, vWithinTolerance, vSpeeding],
      prevPositions,
      12.5
    );

    // Only vSpeeding should have triggered a violation
    expect(violations.length).toBe(1);
    const record = violations[0];
    expect(record.vehicleId).toBe('v_speeder');
    expect(record.vehicleType).toBe('suv');
    expect(record.cameraId).toBe('cam_south_01');
    expect(record.speedLimitKmh).toBe(40.0);
    expect(record.measuredSpeedKmh).toBeCloseTo(49.0, 0);
    expect(record.excessSpeedKmh).toBeCloseTo(9.0, 0);
    expect(record.timestamp).toBe(12.5);
  });

  it('should not record duplicate violations for the same vehicle-camera passage', () => {
    const manager = new SpeedEnforcementManager({
      mainApproachKmh: 40.0,
      enforcementToleranceKmh: 2.0
    });

    const vSpeeding = new Vehicle({
      id: 'v_repeat_test',
      laneId: 'SOUTH_0',
      type: 'taxi',
      s: 41.0,
      v: kmhToMs(50)
    });

    // First step across line (39.0m -> 41.0m)
    const prevPos1 = new Map<string, number>([['v_repeat_test', 39.0]]);
    const violations1 = manager.checkSpeedViolations([vSpeeding], prevPos1, 5.0);
    expect(violations1.length).toBe(1);

    // Next step further down the lane (41.0m -> 43.0m)
    vSpeeding.s = 43.0;
    const prevPos2 = new Map<string, number>([['v_repeat_test', 41.0]]);
    const violations2 = manager.checkSpeedViolations([vSpeeding], prevPos2, 5.1);

    // Should not trigger again
    expect(violations2.length).toBe(0);
    expect(manager.getTotalViolationsCount()).toBe(1);
  });

  it('should clear violation history and passage tracking upon reset', () => {
    const manager = new SpeedEnforcementManager();

    const vSpeeding = new Vehicle({
      id: 'v_reset_test',
      laneId: 'SOUTH_0',
      s: 41.0,
      v: kmhToMs(55)
    });

    const prevPos = new Map<string, number>([['v_reset_test', 39.0]]);
    manager.checkSpeedViolations([vSpeeding], prevPos, 1.0);
    expect(manager.getTotalViolationsCount()).toBe(1);

    // Reset
    manager.reset();
    expect(manager.getTotalViolationsCount()).toBe(0);
    expect(manager.getViolations().length).toBe(0);

    // Same passage can now be registered afresh if re-run
    const violationsAfter = manager.checkSpeedViolations([vSpeeding], prevPos, 1.0);
    expect(violationsAfter.length).toBe(1);
  });
});
