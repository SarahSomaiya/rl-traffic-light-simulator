import { VehicleClassConfig, VehicleType } from '../types';

/**
 * Velocity unit conversions.
 */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/**
 * Base generic vehicle configuration defaults.
 */
export const BASE_VEHICLE_CONFIG: Omit<VehicleClassConfig, 'type' | 'displayName' | 'defaultColors'> = {
  length: 4.5,
  width: 1.8,
  height: 1.5,
  maxSpeed: 12.0, // ~43.2 km/h
  desiredAcceleration: 2.4,
  comfortableDeceleration: 3.0,
  minGap: 2.5,
  timeHeadway: 1.2,
  isEmergencyCapable: false
};

/**
 * Class-specific overrides for all 7 vehicle types.
 */
export const VEHICLE_CLASSES: Record<VehicleType, VehicleClassConfig> = {
  hatchback: {
    ...BASE_VEHICLE_CONFIG,
    type: 'hatchback',
    displayName: 'Compact Hatchback',
    length: 3.85,
    width: 1.73,
    height: 1.50,
    maxSpeed: 12.5,
    desiredAcceleration: 2.3,
    comfortableDeceleration: 3.2,
    minGap: 2.0,
    timeHeadway: 1.1,
    defaultColors: [0xef4444, 0x06b6d4, 0xf97316, 0x8b5cf6, 0xf8fafc],
    isEmergencyCapable: false
  },
  sedan: {
    ...BASE_VEHICLE_CONFIG,
    type: 'sedan',
    displayName: 'Executive Sedan',
    length: 4.65,
    width: 1.80,
    height: 1.42,
    maxSpeed: 13.0,
    desiredAcceleration: 2.5,
    comfortableDeceleration: 3.0,
    minGap: 2.5,
    timeHeadway: 1.2,
    defaultColors: [0x3b82f6, 0x1e293b, 0xf8fafc, 0x64748b, 0x0f172a],
    isEmergencyCapable: false
  },
  suv: {
    ...BASE_VEHICLE_CONFIG,
    type: 'suv',
    displayName: 'Full-Size SUV',
    length: 4.95,
    width: 1.96,
    height: 1.88,
    maxSpeed: 12.0,
    desiredAcceleration: 2.0,
    comfortableDeceleration: 2.8,
    minGap: 2.8,
    timeHeadway: 1.4,
    defaultColors: [0x15803d, 0x334155, 0x78350f, 0x0f172a, 0xf8fafc],
    isEmergencyCapable: false
  },
  taxi: {
    ...BASE_VEHICLE_CONFIG,
    type: 'taxi',
    displayName: 'City Taxi Cab',
    length: 4.60,
    width: 1.78,
    height: 1.46,
    maxSpeed: 12.5,
    desiredAcceleration: 2.4,
    comfortableDeceleration: 3.0,
    minGap: 2.2,
    timeHeadway: 1.2,
    defaultColors: [0xfacc15, 0xeab308], // Iconic taxi yellow/amber
    isEmergencyCapable: false
  },
  police: {
    ...BASE_VEHICLE_CONFIG,
    type: 'police',
    displayName: 'Police Patrol Cruiser',
    length: 4.80,
    width: 1.86,
    height: 1.52,
    maxSpeed: 15.5, // High pursuit capability (~55.8 km/h)
    desiredAcceleration: 3.0,
    comfortableDeceleration: 3.6,
    minGap: 2.2,
    timeHeadway: 1.1,
    defaultColors: [0x1e293b], // Dark police body with white door accents
    isEmergencyCapable: true
  },
  ambulance: {
    ...BASE_VEHICLE_CONFIG,
    type: 'ambulance',
    displayName: 'Emergency Ambulance',
    length: 5.65,
    width: 2.12,
    height: 2.45,
    maxSpeed: 14.5, // ~52.2 km/h
    desiredAcceleration: 2.2,
    comfortableDeceleration: 2.9,
    minGap: 3.0,
    timeHeadway: 1.3,
    defaultColors: [0xffffff], // Medical white with red striping
    isEmergencyCapable: true
  },
  van: {
    ...BASE_VEHICLE_CONFIG,
    type: 'van',
    displayName: 'Delivery Cargo Van',
    length: 5.45,
    width: 2.05,
    height: 2.35,
    maxSpeed: 10.5, // Lower commercial speed (~37.8 km/h)
    desiredAcceleration: 1.6,
    comfortableDeceleration: 2.4,
    minGap: 3.2,
    timeHeadway: 1.5,
    defaultColors: [0xe2e8f0, 0x94a3b8, 0x0284c7, 0xd97706],
    isEmergencyCapable: false
  }
};

/**
 * Returns configuration for a specific vehicle class.
 */
export function getVehicleClassConfig(type: VehicleType): VehicleClassConfig {
  return VEHICLE_CLASSES[type] ?? VEHICLE_CLASSES.sedan;
}

/**
 * Default spawn distribution weights (percentages summing to 100).
 * Dominated by ordinary passenger vehicles with low emergency frequencies.
 */
export const DEFAULT_SPAWN_WEIGHTS: Record<VehicleType, number> = {
  sedan: 35,
  hatchback: 30,
  suv: 15,
  taxi: 10,
  van: 6,
  police: 2,
  ambulance: 2
};
