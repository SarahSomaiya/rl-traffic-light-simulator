import * as THREE from 'three';
import { RoadRenderer, DEFAULT_ROAD_DIMENSIONS, RoadDimensions } from './RoadRenderer';
import { TrafficLightMesh } from './TrafficLightMesh';
import { CameraController } from './CameraController';
import { VehicleMeshPool } from './VehicleMeshPool';
import { TrafficEnvironment } from '../sim/TrafficEnvironment';
import { Direction, LightState } from '../types';

export interface SceneManagerOptions {
  container: HTMLElement;
  roadDimensions?: RoadDimensions;
}

/**
 * Coordinates the Three.js scene, camera, lighting, renderer, traffic signals,
 * vehicle mesh pool, and connects to the headless TrafficEnvironment.
 */
export class SceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private roadRenderer: RoadRenderer;
  private cameraController: CameraController;
  private trafficLights: Map<Direction, TrafficLightMesh> = new Map();
  private vehicleMeshPool: VehicleMeshPool;
  private trafficEnvironment: TrafficEnvironment;

  private clock: THREE.Clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private onResizeBound: () => void;
  private isDisposed: boolean = false;

  constructor(options: SceneManagerOptions) {
    this.container = options.container;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.0055);

    // 2. Camera setup
    const aspect = this.getAspectRatio();
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 1000);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Append canvas to container
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 4. Camera Controller setup
    this.cameraController = new CameraController(this.camera, this.renderer.domElement);

    // 5. Lighting setup
    this.setupLighting();

    // 6. Road & Environment setup
    this.roadRenderer = new RoadRenderer(options.roadDimensions ?? DEFAULT_ROAD_DIMENSIONS);
    this.scene.add(this.roadRenderer.getRoot());

    // 7. Traffic Signals setup
    this.setupTrafficLights();

    // 8. Headless Simulation and 3D Vehicle Mesh Pool
    this.trafficEnvironment = new TrafficEnvironment();
    this.vehicleMeshPool = new VehicleMeshPool(
      this.scene,
      this.trafficEnvironment.getLaneNetwork()
    );

    // 9. Event listeners
    this.onResizeBound = this.handleResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);

    // 10. Start animation loop
    this.animate = this.animate.bind(this);
    this.start();
  }

  private getAspectRatio(): number {
    const width = this.container.clientWidth || window.innerWidth || 1;
    const height = this.container.clientHeight || window.innerHeight || 1;
    return width / height;
  }

  private setupLighting(): void {
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.65);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(60, 80, 45);
    sunLight.castShadow = true;

    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 220;

    const d = 55;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;

    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    fillLight.position.set(-50, 40, -50);
    this.scene.add(fillLight);
  }

  private setupTrafficLights(): void {
    const signalConfigs: Array<{
      direction: Direction;
      position: THREE.Vector3;
      rotationY: number;
      initialState: LightState;
    }> = [
      {
        direction: Direction.NORTH,
        position: new THREE.Vector3(-8.8, 0.25, -12.0),
        rotationY: Math.PI,
        initialState: 'red'
      },
      {
        direction: Direction.SOUTH,
        position: new THREE.Vector3(8.8, 0.25, 12.0),
        rotationY: 0,
        initialState: 'red'
      },
      {
        direction: Direction.EAST,
        position: new THREE.Vector3(12.0, 0.25, -8.8),
        rotationY: Math.PI / 2,
        initialState: 'green'
      },
      {
        direction: Direction.WEST,
        position: new THREE.Vector3(-12.0, 0.25, 8.8),
        rotationY: -Math.PI / 2,
        initialState: 'green'
      }
    ];

    signalConfigs.forEach(cfg => {
      const signal = new TrafficLightMesh({
        direction: cfg.direction,
        position: cfg.position,
        rotationY: cfg.rotationY,
        initialState: cfg.initialState
      });
      this.trafficLights.set(cfg.direction, signal);
      this.scene.add(signal.getRoot());
    });
  }

  private handleResize(): void {
    if (this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.cameraController.handleResize(width, height);
    this.renderer.setSize(width, height);
  }

  private start(): void {
    if (this.animationFrameId === null && !this.isDisposed) {
      this.clock.start();
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  private animate(): void {
    if (this.isDisposed) return;

    const delta = this.clock.getDelta();

    // 1. Update camera controls & smooth interpolation
    this.cameraController.update(delta);

    // 2. Advance headless traffic physics
    this.trafficEnvironment.step(delta);

    // 3. Sync 3D vehicle meshes with simulation vehicles
    this.vehicleMeshPool.sync(this.trafficEnvironment.getVehicles());

    // 4. Sync 3D traffic light meshes with simulation signals
    const signals = this.trafficEnvironment.getSignalStates();
    signals.forEach((state, dir) => {
      this.setSignalState(dir, state);
    });

    // 5. Render Three.js frame
    this.render();

    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public getRoadRenderer(): RoadRenderer {
    return this.roadRenderer;
  }

  public getCameraController(): CameraController {
    return this.cameraController;
  }

  public getTrafficEnvironment(): TrafficEnvironment {
    return this.trafficEnvironment;
  }

  public getVehicleMeshPool(): VehicleMeshPool {
    return this.vehicleMeshPool;
  }

  public getTrafficLights(): Map<Direction, TrafficLightMesh> {
    return this.trafficLights;
  }

  public setSignalState(direction: Direction, state: LightState): void {
    const light = this.trafficLights.get(direction);
    if (light) {
      light.setSignalState(state);
    }
  }

  public setAllSignals(state: LightState): void {
    this.trafficLights.forEach(light => light.setSignalState(state));
  }

  public resetSimulation(): void {
    this.trafficEnvironment.reset();
    this.vehicleMeshPool.clear();
  }

  /**
   * Cleans up scene resources, geometries, materials, event listeners, and renderer.
   */
  public dispose(): void {
    this.isDisposed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    window.removeEventListener('resize', this.onResizeBound);

    this.trafficLights.forEach(light => {
      this.scene.remove(light.getRoot());
      light.dispose();
    });
    this.trafficLights.clear();

    this.vehicleMeshPool.dispose();
    this.cameraController.dispose();
    this.roadRenderer.dispose();
    this.scene.clear();

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
