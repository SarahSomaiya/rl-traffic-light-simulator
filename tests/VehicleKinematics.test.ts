import { describe, it, expect } from 'vitest';
import { Vehicle } from '../src/sim/Vehicle';

describe('Vehicle Kinematics & Traffic Rules (Headless)', () => {
  const STOP_LINE = 88.5; // stop line distance (m)

  it('should decelerate and stop before a red light', () => {
    // Vehicle approaching stop line at initial speed 9 m/s, starting 45m away from stop line
    const vehicle = new Vehicle({
      id: 'v_test_red',
      laneId: 'SOUTH_0',
      s: 43.5,
      v: 9.0,
      length: 4.2
    });

    const dt = 0.05;
    // Step forward 8 seconds (160 ticks) with red light
    for (let t = 0; t < 160; t++) {
      vehicle.update(dt, null, STOP_LINE, 'red');
    }

    // Vehicle must come to a safe complete stop before or at the stop line
    expect(vehicle.v).toBeLessThan(0.05);
    expect(vehicle.s).toBeLessThanOrEqual(STOP_LINE);
    expect(vehicle.hasPassedStopLine).toBe(false);
  });

  it('should queue behind a stopped lead vehicle without colliding or violating minimum gap', () => {
    // Lead vehicle stopped just before stop line
    const leadVehicle = new Vehicle({
      id: 'v_lead',
      laneId: 'SOUTH_0',
      s: 85.0,
      v: 0.0,
      length: 4.2
    });

    // Following vehicle approaching from behind at 8.5 m/s
    const followVehicle = new Vehicle({
      id: 'v_follower',
      laneId: 'SOUTH_0',
      s: 60.0,
      v: 8.5,
      length: 4.2
    });

    const dt = 0.05;
    // Step forward 6 seconds (120 ticks)
    for (let t = 0; t < 120; t++) {
      followVehicle.update(dt, leadVehicle, STOP_LINE, 'red');
    }

    // Follower must come to a stop behind lead vehicle
    expect(followVehicle.v).toBeLessThan(0.05);

    // Physical gap between follower's front bumper and lead vehicle's rear
    const physicalGap = leadVehicle.s - followVehicle.s - leadVehicle.length;
    expect(physicalGap).toBeGreaterThanOrEqual(1.8); // strictly positive, no collision!
  });

  it('should accelerate and cross the intersection when light turns green', () => {
    // Stopped vehicle at stop line
    const vehicle = new Vehicle({
      id: 'v_green_test',
      laneId: 'SOUTH_0',
      s: 86.0,
      v: 0.0,
      length: 4.2
    });

    const dt = 0.05;
    // Step forward 3 seconds on green
    for (let t = 0; t < 60; t++) {
      vehicle.update(dt, null, STOP_LINE, 'green');
    }

    // Vehicle must accelerate and cross the stop line
    expect(vehicle.v).toBeGreaterThan(4.0);
    expect(vehicle.s).toBeGreaterThan(STOP_LINE);
    expect(vehicle.hasPassedStopLine).toBe(true);
  });
});
