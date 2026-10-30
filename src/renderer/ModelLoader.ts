import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelLoadOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export type LoadingProgressCallback = (loaded: number, total: number, url: string) => void;

/**
 * Reusable asynchronous GLTF model loader with memory caching,
 * shadow configuration, concurrent batch preloading, and non-blocking fallback handling.
 */
export class ModelLoader {
  private static loader: GLTFLoader = new GLTFLoader();
  private static modelCache: Map<string, THREE.Group> = new Map();
  private static pendingLoads: Map<string, Promise<THREE.Group | null>> = new Map();
  private static loadedCount: number = 0;
  private static requestedCount: number = 0;
  private static failedCount: number = 0;
  private static progressListeners: Set<LoadingProgressCallback> = new Set();

  /**
   * Preloads a list of model URLs concurrently.
   */
  public static async preloadAssets(urls: string[]): Promise<void> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    const uniqueUrls = Array.from(new Set(urls));
    await Promise.all(uniqueUrls.map(url => this.loadModel(url)));
  }

  /**
   * Subscribes to asset loading progress events.
   */
  public static onProgress(callback: LoadingProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  /**
   * Returns current loader statistics.
   */
  public static getStats() {
    return {
      cachedModels: this.modelCache.size,
      pendingLoads: this.pendingLoads.size,
      loadedCount: this.loadedCount,
      requestedCount: this.requestedCount,
      failedCount: this.failedCount
    };
  }

  /**
   * Loads a GLTF model from the given URL with optional shadow configuration.
   * Returns a cloned THREE.Group if successful, or null on failure.
   */
  public static async loadModel(
    url: string,
    options: ModelLoadOptions = { castShadow: true, receiveShadow: true }
  ): Promise<THREE.Group | null> {
    // 1. Return from clone cache if already loaded
    const cached = this.modelCache.get(url);
    if (cached) {
      return this.cloneModel(cached, options);
    }

    // 2. Reuse in-flight promise if currently downloading
    const pending = this.pendingLoads.get(url);
    if (pending) {
      const res = await pending;
      return res ? this.cloneModel(res, options) : null;
    }

    this.requestedCount++;

    // 3. Initiate fetch and parse
    const loadPromise = new Promise<THREE.Group | null>((resolve) => {
      // In non-browser or test environments where fetch/DOM isn't available, fail gracefully
      if (typeof window === 'undefined' || typeof fetch === 'undefined') {
        resolve(null);
        return;
      }

      this.loader.load(
        url,
        (gltf) => {
          const root = gltf.scene;
          this.modelCache.set(url, root);
          this.pendingLoads.delete(url);
          this.loadedCount++;

          this.progressListeners.forEach(fn => fn(this.loadedCount, this.requestedCount, url));
          resolve(root);
        },
        undefined,
        (err) => {
          console.warn(`[ModelLoader] Failed to load model at ${url}:`, err);
          this.pendingLoads.delete(url);
          this.failedCount++;
          resolve(null);
        }
      );
    });

    this.pendingLoads.set(url, loadPromise);
    const result = await loadPromise;
    return result ? this.cloneModel(result, options) : null;
  }

  /**
   * Deep clones a model hierarchy and applies specific shadow preferences.
   */
  private static cloneModel(source: THREE.Group, options?: ModelLoadOptions): THREE.Group {
    const clone = source.clone(true);
    const cast = options?.castShadow ?? true;
    const receive = options?.receiveShadow ?? true;

    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
      }
    });

    return clone;
  }

  /**
   * Cleans up cached models and materials.
   */
  public static clearCache(): void {
    this.modelCache.forEach((group) => {
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
    });
    this.modelCache.clear();
    this.pendingLoads.clear();
    this.loadedCount = 0;
    this.requestedCount = 0;
    this.failedCount = 0;
  }
}

