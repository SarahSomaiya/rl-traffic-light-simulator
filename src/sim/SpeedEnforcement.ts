import { Direction, SpeedCameraDefinition, SpeedLimitConfig, SpeedViolationRecord } from '../types';
import { Vehicle } from './Vehicle';
import { msToKmh, kmhToMs } from './VehicleClasses';

export const DEFAULT_SPEED_LIMIT_CONFIG: SpeedLimitConfig = {
  mainApproachKmh: 40.0,
  residentialSideKmh: 30.0,
  enforcementToleranceKmh: 2.0
};

/**
 * Headless Speed Enforcement and Camera Detection Manager.
 * Operates purely on simulation state and fixed simulation clock.
 */
export class SpeedEnforcementManager {
  private config: SpeedLimitConfig;
  private cameras: SpeedCameraDefinition[] = [];
  private violations: SpeedViolationRecord[] = [];
  // Set of `${vehicleId}_${cameraId}` to prevent duplicate records for the same passage
  private recordedPassages: Set<string> = new Set();
  private nextViolationId: number = 1;

  // Optional listener for visual flash or external telemetry
  public onViolationDetected?: (record: SpeedViolationRecord) => void;

  constructor(config: Partial<SpeedLimitConfig> = {}) {
    this.config = { ...DEFAULT_SPEED_LIMIT_CONFIG, ...config };
    this.initDefaultCameras();
  }

  /**
   * Initializes roadside speed cameras at selected approach roads.
   * Placed safely outside travel lanes on sidewalks.
   */
  private initDefaultCameras(): void {
    // Road half-length is 100m. Center is (0,0). Stop lines are at s = 88.5m.
    // Camera on South approach at s = 40m (World Z = 100 - 40 = 60m), curbside East X = 9.8m.
    // Facing oncoming Southbound-to-North traffic.
    this.cameras = [
      {
        id: 'cam_south_01',
        direction: Direction.SOUTH,
        laneId: 'SOUTH_0',
        detectionDistance: 40.0,
        roadSideOffset: 9.8,
        worldX: 9.8,
        worldZ: 60.0,
        rotationY: 0, // Faces towards +Z (oncoming traffic approaching from +Z)
        speedLimitKmh: this.config.mainApproachKmh
      },
      {
        id: 'cam_west_01',
        direction: Direction.WEST,
        laneId: 'WEST_0',
        detectionDistance: 45.0,
        roadSideOffset: 9.8,
        worldX: -55.0,
        worldZ: 9.8,
        rotationY: -Math.PI / 2, // Faces towards -X (oncoming traffic from -X)
        speedLimitKmh: this.config.mainApproachKmh
      },
      {
        id: 'cam_north_01',
        direction: Direction.NORTH,
        laneId: 'NORTH_0',
        detectionDistance: 40.0,
        roadSideOffset: 9.8,
        worldX: -9.8,
        worldZ: -60.0,
        rotationY: Math.PI, // Faces towards -Z
        speedLimitKmh: this.config.mainApproachKmh
      },
      {
        id: 'cam_east_01',
        direction: Direction.EAST,
        laneId: 'EAST_0',
        detectionDistance: 45.0,
        roadSideOffset: 9.8,
        worldX: 55.0,
        worldZ: -9.8,
        rotationY: Math.PI / 2, // Faces towards +X
        speedLimitKmh: this.config.mainApproachKmh
      }
    ];
  }

  public getCameras(): SpeedCameraDefinition[] {
    return this.cameras;
  }

  public getSpeedLimitConfig(): SpeedLimitConfig {
    return this.config;
  }

  public setSpeedLimitConfig(config: Partial<SpeedLimitConfig>): void {
    this.config = { ...this.config, ...config };
    // Update camera limits
    this.cameras.forEach(cam => {
      cam.speedLimitKmh = this.config.mainApproachKmh;
    });
  }

  /**
   * Returns applicable road speed limit in m/s for a given lane.
   */
  public getSpeedLimitMsForLane(_laneId: string): number {
    return kmhToMs(this.config.mainApproachKmh);
  }

  public getViolations(): SpeedViolationRecord[] {
    return this.violations;
  }

  public getTotalViolationsCount(): number {
    return this.violations.length;
  }

  /**
   * Checks for speed violations when vehicles step along lanes.
   *
   * @param vehicles Currently active vehicles in the environment
   * @param prevPositions Map of vehicle ID to previous s coordinate
   * @param simTime Current simulation timestamp in seconds
   */
  public checkSpeedViolations(
    vehicles: Vehicle[],
    prevPositions: Map<string, number>,
    simTime: number
  ): SpeedViolationRecord[] {
    const newViolations: SpeedViolationRecord[] = [];

    for (const vehicle of vehicles) {
      const prevS = prevPositions.get(vehicle.id) ?? vehicle.s;
      const currS = vehicle.s;

      for (const camera of this.cameras) {
        // Camera monitors its direction and detection line
        // Either matches specific lane or matching direction
        const isMonitoredApproach = vehicle.laneId.startsWith(camera.direction);
        if (!isMonitoredApproach) continue;

        const detDist = camera.detectionDistance;

        // Vehicle crossed detection line during this timestep: prevS < detDist <= currS
        if (prevS < detDist && currS >= detDist) {
          const passageKey = `${vehicle.id}_${camera.id}`;

          // Avoid duplicate recordings for the same passage
          if (this.recordedPassages.has(passageKey)) continue;
          this.recordedPassages.add(passageKey);

          const measuredKmh = msToKmh(vehicle.v);
          const limitKmh = camera.speedLimitKmh;
          const thresholdKmh = limitKmh + this.config.enforcementToleranceKmh;

          if (measuredKmh > thresholdKmh) {
            const record: SpeedViolationRecord = {
              id: `viol_${this.nextViolationId++}`,
              timestamp: parseFloat(simTime.toFixed(2)),
              vehicleId: vehicle.id,
              vehicleType: vehicle.type,
              cameraId: camera.id,
              measuredSpeedKmh: parseFloat(measuredKmh.toFixed(1)),
              speedLimitKmh: limitKmh,
              excessSpeedKmh: parseFloat((measuredKmh - limitKmh).toFixed(1))
            };

            this.violations.push(record);
            newViolations.push(record);

            if (this.onViolationDetected) {
              this.onViolationDetected(record);
            }
          }
        }
      }
    }

    return newViolations;
  }

  /**
   * Resets all violation logs and passage tracking.
   */
  public reset(): void {
    this.violations = [];
    this.recordedPassages.clear();
    this.nextViolationId = 1;
  }
}
