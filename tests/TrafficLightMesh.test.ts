import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TrafficLightMesh } from '../src/renderer/TrafficLightMesh';
import { Direction } from '../src/types';

describe('TrafficLightMesh Test Suite', () => {
  it('should initialize signal model with correct direction and group name', () => {
    const light = new TrafficLightMesh({
      direction: Direction.NORTH,
      position: new THREE.Vector3(0, 0, 0),
      rotationY: 0,
      initialState: 'red'
    });

    const root = light.getRoot();
    expect(root).toBeInstanceOf(THREE.Group);
    expect(root.name).toBe('TrafficLight_NORTH');
    expect(light.getDirection()).toBe(Direction.NORTH);
    expect(light.getSignalState()).toBe('red');
  });

  it('should programmatically update signal states among red, yellow, and green', () => {
    const light = new TrafficLightMesh({
      direction: Direction.SOUTH,
      position: new THREE.Vector3(10, 0, 10),
      rotationY: Math.PI,
      initialState: 'red'
    });

    expect(light.getSignalState()).toBe('red');

    light.setSignalState('green');
    expect(light.getSignalState()).toBe('green');

    light.setSignalState('yellow');
    expect(light.getSignalState()).toBe('yellow');

    light.setSignalState('red');
    expect(light.getSignalState()).toBe('red');
  });

  it('should cleanly dispose internal geometries without errors', () => {
    const light = new TrafficLightMesh({
      direction: Direction.EAST,
      position: new THREE.Vector3(5, 0, -5),
      rotationY: Math.PI / 2
    });

    expect(light.getRoot().children.length).toBeGreaterThan(0);
    light.dispose();
    expect(light.getRoot().children.length).toBe(0);
  });

  it('should maintain consistent signal state across rapid updates', () => {
    const light = new TrafficLightMesh({
      direction: Direction.WEST,
      position: new THREE.Vector3(0, 0, 0),
      rotationY: 0
    });

    const sequence: ('red' | 'yellow' | 'green')[] = ['yellow', 'green', 'red', 'yellow', 'red', 'green'];
    sequence.forEach(state => {
      light.setSignalState(state);
      expect(light.getSignalState()).toBe(state);
    });
  });
});
