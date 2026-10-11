import { describe, it, expect } from 'vitest';
import { CAMERA_PRESETS } from '../src/renderer/CameraController';

describe('CameraController Presets & Configuration', () => {
  it('should define isometric, overhead, and street presets', () => {
    expect(CAMERA_PRESETS.isometric).toBeDefined();
    expect(CAMERA_PRESETS.overhead).toBeDefined();
    expect(CAMERA_PRESETS.street).toBeDefined();
  });

  it('should have elevated perspective for isometric preset', () => {
    const iso = CAMERA_PRESETS.isometric;
    expect(iso.position.y).toBeGreaterThan(40);
    expect(iso.target.y).toBeCloseTo(0);
  });

  it('should have near-vertical vantage point for overhead preset', () => {
    const top = CAMERA_PRESETS.overhead;
    expect(top.position.y).toBeGreaterThan(80);
    expect(Math.abs(top.position.x)).toBeLessThan(1);
    expect(top.target.y).toBeCloseTo(0);
  });

  it('should have low street-level elevation for street preset', () => {
    const street = CAMERA_PRESETS.street;
    expect(street.position.y).toBeLessThan(15);
    expect(street.position.y).toBeGreaterThan(0);
  });
});
