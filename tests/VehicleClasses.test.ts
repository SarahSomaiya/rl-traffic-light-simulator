import { describe, it, expect } from 'vitest';
import { getVehicleClassConfig, kmhToMs, msToKmh } from '../src/sim/VehicleClasses';
import { Vehicle } from '../src/sim/Vehicle';
import { VehicleType } from '../src/types';

describe('Vehicle Classes & Kinematics Configuration', () => {
  const allTypes: VehicleType[] = [
    'hatchback',
    'sedan',
    'suv',
    'taxi',
    'police',
    'ambulance',
    'van'
  ];

  it('1. should define valid dimensions and kinematic properties for all 7 vehicle classes', () => {
    allTypes.forEach(type => {
      const cfg = getVehicleClassConfig(type);
      expect(cfg).toBeDefined();
      expect(cfg.type).toBe(type);
      expect(cfg.displayName.length).toBeGreaterThan(0);
      expect(cfg.length).toBeGreaterThan(3.0);
      expect(cfg.width).toBeGreaterThan(1.5);
      expect(cfg.height).toBeGreaterThan(1.2);
      expect(cfg.maxSpeed).toBeGreaterThan(8.0);
      expect(cfg.desiredAcceleration).toBeGreaterThan(1.0);
      expect(cfg.comfortableDeceleration).toBeGreaterThan(1.5);
      expect(cfg.minGap).toBeGreaterThanOrEqual(1.5);
      expect(cfg.timeHeadway).toBeGreaterThanOrEqual(1.0);
      expect(cfg.defaultColors.length).toBeGreaterThan(0);
    });
  });

  it('2. should enforce realistic relative differences between vehicle classes', () => {
    const police = getVehicleClassConfig('police');
    const van = getVehicleClassConfig('van');
    const suv = getVehicleClassConfig('suv');
    const hatchback = getVehicleClassConfig('hatchback');

    // Police cruiser has higher top speed and acceleration than commercial cargo van
    expect(police.maxSpeed).toBeGreaterThan(van.maxSpeed);
    expect(police.desiredAcceleration).toBeGreaterThan(van.desiredAcceleration);

    // SUV and Van are substantially taller and heavier than compact hatchback
    expect(suv.height).toBeGreaterThan(hatchback.height);
    expect(van.length).toBeGreaterThan(hatchback.length);

    // Only police and ambulance are emergency-capable
    expect(police.isEmergencyCapable).toBe(true);
    expect(getVehicleClassConfig('ambulance').isEmergencyCapable).toBe(true);
    expect(van.isEmergencyCapable).toBe(false);
    expect(hatchback.isEmergencyCapable).toBe(false);
  });

  it('3. should convert accurately between km/h and metres per second', () => {
    expect(kmhToMs(36)).toBeCloseTo(10.0, 4);
    expect(kmhToMs(40)).toBeCloseTo(11.111, 3);
    expect(kmhToMs(0)).toBe(0);

    expect(msToKmh(10)).toBeCloseTo(36.0, 4);
    expect(msToKmh(11.1111)).toBeCloseTo(40.0, 2);
  });

  it('4. should respect the configured road speed limit in free-flow IDM updates', () => {
    // A fast vehicle (max speed 15 m/s) on a road with 30 km/h (8.33 m/s) speed limit
    const vehicle = new Vehicle({
      id: 'v_limit_test',
      laneId: 'SOUTH_0',
      type: 'sedan',
      s: 0,
      v: 5.0
    });

    const roadLimitMs = kmhToMs(30); // 8.333 m/s
    const dt = 0.05;

    // Run 10 seconds of free-flow driving with green light and no obstacles
    for (let t = 0; t < 200; t++) {
      vehicle.update(dt, null, 1000, 'green', roadLimitMs);
    }

    // Speed must approach the road speed limit and not exceed it
    expect(vehicle.v).toBeLessThanOrEqual(roadLimitMs + 0.05);
    expect(vehicle.v).toBeGreaterThan(roadLimitMs - 0.2);
  });
});
