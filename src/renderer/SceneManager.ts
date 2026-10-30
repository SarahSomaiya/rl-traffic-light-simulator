import * as THREE from 'three';
import { RoadRenderer, DEFAULT_ROAD_DIMENSIONS, RoadDimensions } from './RoadRenderer';
import { TrafficLightMesh } from './TrafficLightMesh';
import { CameraController } from './CameraController';
import { VehicleMeshPool } from './VehicleMeshPool';
import { SpeedCameraMesh } from './SpeedCameraMesh';
import { EnvironmentController } from './EnvironmentController';
import { TrafficAmbienceAudio, AudioUpdateContext } from '../audio/TrafficAmbienceAudio';
import { TrafficEnvironment } from '../sim/TrafficEnvironment';
import { Direction, LightState } from '../types';

export interface SceneManagerOptions {
  container: HTMLElement;
  roadDimensions?: RoadDimensions;
}

/**
 * Coordinates the Three.js scene, camera, lighting, renderer, traffic signals,
 * speed cameras, vehicle mesh pool, and connects to the headless TrafficEnvironment.
 */
export class SceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private roadRenderer: RoadRenderer;
  private cameraController: CameraController;
  private trafficLights: Map<Direction, TrafficLightMesh> = new Map();
  private speedCameraMeshes: Map<string, SpeedCameraMesh> = new Map();
  private vehicleMeshPool: VehicleMeshPool;
  private trafficEnvironment: TrafficEnvironment;

  // Day/Night Environment & Audio Ambience
  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private sunLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private environmentController: EnvironmentController;
  private ambienceAudio: TrafficAmbienceAudio;
  private cachedAudioContext: AudioUpdateContext = {
    hasActiveAmbulance: false,
    hasActivePolice: false,
    isNight: false,
    vehicles: []
  };

  private clock: THREE.Clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private onResizeBound: () => void;
  private isDisposed: boolean = false;

  constructor(options: SceneManagerOptions) {
    this.container = options.container;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcad6e2);
    this.scene.fog = new THREE.Fog(0xcad6e2, 120, 290);

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
    this.renderer.toneMappingExposure = 1.1;

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

    // 9. Speed Enforcement 3D Cameras setup
    this.setupSpeedCameras();

    // 10. Day/Night Environment Controller & Traffic Ambience Audio
    this.environmentController = new EnvironmentController({
      scene: this.scene,
      renderer: this.renderer,
      hemiLight: this.hemiLight,
      ambientLight: this.ambientLight,
      sunLight: this.sunLight,
      fillLight: this.fillLight,
      roadRenderer: this.roadRenderer,
      vehicleMeshPool: this.vehicleMeshPool
    });
    this.ambienceAudio = new TrafficAmbienceAudio();

    // 11. Event listeners
    this.onResizeBound = this.handleResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);

    // 12. Start animation loop
    this.animate = this.animate.bind(this);
    this.start();
  }

  private getAspectRatio(): number {
    const width = this.container.clientWidth || window.innerWidth || 1;
    const height = this.container.clientHeight || window.innerHeight || 1;
    return width / height;
  }

  private setupLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x4a7c59, 0.6);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.45);
    this.sunLight.position.set(65, 85, 50);
    this.sunLight.castShadow = true;

    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 240;

    const d = 65;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.02;

    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.28);
    this.fillLight.position.set(-50, 45, -50);
    this.scene.add(this.fillLight);
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

  private setupSpeedCameras(): void {
    const cameraDefs = this.trafficEnvironment.getSpeedCameras();
    cameraDefs.forEach(def => {
      const cameraMesh = new SpeedCameraMesh(def);
      this.speedCameraMeshes.set(def.id, cameraMesh);
      this.scene.add(cameraMesh.getRoot());
    });

    // Wire speed enforcement violation strobe flash
    this.trafficEnvironment.getSpeedEnforcement().onViolationDetected = record => {
      const mesh = this.speedCameraMeshes.get(record.cameraId);
      if (mesh) {
        mesh.triggerViolationFlash();
      }
    };
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

    // 2. Advance Day/Night environment transition
    this.environmentController.update(delta);

    // 2b. Advance layered traffic ambience audio (sirens, horns, birds)
    const vehicles = this.trafficEnvironment.getVehicles();
    const hasActiveAmbulance = vehicles.some(v => v.type === 'ambulance');
    const hasActivePolice = vehicles.some(v => v.type === 'police');
    const isNight = this.environmentController.isNightMode();
    this.cachedAudioContext.hasActiveAmbulance = hasActiveAmbulance;
    this.cachedAudioContext.hasActivePolice = hasActivePolice;
    this.cachedAudioContext.isNight = isNight;
    this.cachedAudioContext.vehicles = vehicles;
    this.ambienceAudio.update(delta, this.cachedAudioContext);

    // 3. Advance headless traffic physics
    this.trafficEnvironment.step(delta);

    // 3. Update speed cameras flash timers
    this.speedCameraMeshes.forEach(mesh => mesh.update(delta));

    // 4. Sync 3D vehicle meshes with simulation vehicles & sim time
    this.vehicleMeshPool.sync(
      this.trafficEnvironment.getVehicles(),
      this.trafficEnvironment.getSimSeconds()
    );

    // 5. Sync 3D traffic light meshes with simulation signals
    const signals = this.trafficEnvironment.getSignalStates();
    signals.forEach((state, dir) => {
      this.setSignalState(dir, state);
    });

    // 6. Render Three.js frame
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

  public getSpeedCameraMeshes(): Map<string, SpeedCameraMesh> {
    return this.speedCameraMeshes;
  }

  public getEnvironmentController(): EnvironmentController {
    return this.environmentController;
  }

  public getAmbienceAudio(): TrafficAmbienceAudio {
    return this.ambienceAudio;
  }

  public resetSimulation(): void {
    this.trafficEnvironment.reset();
    this.vehicleMeshPool.clear();
    this.ambienceAudio.reset();
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

    this.speedCameraMeshes.forEach(cam => {
      this.scene.remove(cam.getRoot());
      cam.dispose();
    });
    this.speedCameraMeshes.clear();

    this.vehicleMeshPool.dispose();
    this.cameraController.dispose();
    this.roadRenderer.dispose();
    this.environmentController.dispose();
    this.ambienceAudio.dispose();
    this.scene.clear();

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
