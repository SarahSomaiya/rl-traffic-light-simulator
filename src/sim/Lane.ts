import { Direction } from '../types';

export interface Point2D {
  x: number;
  z: number;
}

export interface LaneDefinition {
  id: string;
  direction: Direction;
  laneIndex: number; // 0 = inner, 1 = outer
  entry: Point2D;
  exit: Point2D;
  heading: number; // Radians: direction of travel
  stopLineDistance: number; // Longitudinal distance s to stop line
  length: number; // Total length of the lane
}

/**
 * Factory and registry for predefined 4-way intersection lanes.
 * Uses exact road coordinates matching RoadRenderer:
 * Road width = 16 (halfWidth = 8), stopLineOffset = 11.5, lane dividers at +/-4.
 */
export class LaneNetwork {
  private lanes: Map<string, LaneDefinition> = new Map();

  constructor(roadHalfLength: number = 100, stopLineOffset: number = 11.5) {
    this.initLanes(roadHalfLength, stopLineOffset);
  }

  private initLanes(roadHalfLength: number, stopLineOffset: number): void {
    // Total lane distance from entry to exit
    const totalLength = roadHalfLength * 2;
    // Distance from entry (e.g. +100 or -100) to stopLineOffset (+11.5 or -11.5)
    const distToStop = roadHalfLength - stopLineOffset;

    // 1. SOUTH Approach (Travels North: entry Z = +100 -> exit Z = -100, Heading = -PI/2 along Z axis towards -Z)
    // Inbound traffic on East side: lane 0 (inner) at X = 2.0, lane 1 (outer) at X = 6.0
    [
      { index: 0, x: 2.0 },
      { index: 1, x: 6.0 }
    ].forEach(({ index, x }) => {
      const id = `SOUTH_${index}`;
      this.lanes.set(id, {
        id,
        direction: Direction.SOUTH,
        laneIndex: index,
        entry: { x, z: roadHalfLength },
        exit: { x, z: -roadHalfLength },
        heading: Math.PI, // Looking towards -Z
        stopLineDistance: distToStop,
        length: totalLength
      });
    });

    // 2. NORTH Approach (Travels South: entry Z = -100 -> exit Z = +100, Heading = 0 along Z axis towards +Z)
    // Inbound traffic on West side: lane 0 (inner) at X = -2.0, lane 1 (outer) at X = -6.0
    [
      { index: 0, x: -2.0 },
      { index: 1, x: -6.0 }
    ].forEach(({ index, x }) => {
      const id = `NORTH_${index}`;
      this.lanes.set(id, {
        id,
        direction: Direction.NORTH,
        laneIndex: index,
        entry: { x, z: -roadHalfLength },
        exit: { x, z: roadHalfLength },
        heading: 0, // Looking towards +Z
        stopLineDistance: distToStop,
        length: totalLength
      });
    });

    // 3. EAST Approach (Travels West: entry X = +100 -> exit X = -100, Heading = -PI/2 along X axis towards -X)
    // Inbound traffic on North side: lane 0 (inner) at Z = -2.0, lane 1 (outer) at Z = -6.0
    [
      { index: 0, z: -2.0 },
      { index: 1, z: -6.0 }
    ].forEach(({ index, z }) => {
      const id = `EAST_${index}`;
      this.lanes.set(id, {
        id,
        direction: Direction.EAST,
        laneIndex: index,
        entry: { x: roadHalfLength, z },
        exit: { x: -roadHalfLength, z },
        heading: -Math.PI / 2, // Looking towards -X
        stopLineDistance: distToStop,
        length: totalLength
      });
    });

    // 4. WEST Approach (Travels East: entry X = -100 -> exit X = +100, Heading = +PI/2 along X axis towards +X)
    // Inbound traffic on South side: lane 0 (inner) at Z = 2.0, lane 1 (outer) at Z = 6.0
    [
      { index: 0, z: 2.0 },
      { index: 1, z: 6.0 }
    ].forEach(({ index, z }) => {
      const id = `WEST_${index}`;
      this.lanes.set(id, {
        id,
        direction: Direction.WEST,
        laneIndex: index,
        entry: { x: -roadHalfLength, z },
        exit: { x: roadHalfLength, z },
        heading: Math.PI / 2, // Looking towards +X
        stopLineDistance: distToStop,
        length: totalLength
      });
    });
  }

  public getLane(id: string): LaneDefinition | undefined {
    return this.lanes.get(id);
  }

  public getAllLanes(): LaneDefinition[] {
    return Array.from(this.lanes.values());
  }

  public getLanesByDirection(dir: Direction): LaneDefinition[] {
    return this.getAllLanes().filter(l => l.direction === dir);
  }

  /**
   * Computes 2D world coordinates (x, z) for a vehicle at longitudinal distance s along a lane.
   */
  public getCoordinatesAt(laneId: string, s: number): Point2D {
    const lane = this.lanes.get(laneId);
    if (!lane) return { x: 0, z: 0 };

    const fraction = Math.max(0, Math.min(1, s / lane.length));
    return {
      x: lane.entry.x + (lane.exit.x - lane.entry.x) * fraction,
      z: lane.entry.z + (lane.exit.z - lane.entry.z) * fraction
    };
  }
}
