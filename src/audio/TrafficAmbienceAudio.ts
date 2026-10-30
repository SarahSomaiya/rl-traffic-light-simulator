import { Vehicle } from '../sim/Vehicle';

export interface AudioUpdateContext {
  hasActiveAmbulance: boolean;
  hasActivePolice: boolean;
  isNight: boolean;
  vehicles: Vehicle[];
}

/**
 * TrafficAmbienceAudio
 * 
 * Comprehensive urban audio soundscape combining:
 * 1. Continuous layered distant road traffic bed (preloaded local WAV or procedural fallback)
 * 2. Randomized realistic dual-tone car horns (triggered when vehicles wait/stop at intersections)
 * 3. Daytime natural songbird chirps (park ambiance, subdued/silent at night)
 * 4. Realistic emergency sirens for active ambulance and police units (synchronized to simulation state)
 * 5. Complete pause, reset, mute, and browser autoplay compliance
 */
export class TrafficAmbienceAudio {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Layer gain nodes
  private ambulanceGain: GainNode | null = null;
  private policeGain: GainNode | null = null;

  // Active looping siren sources
  private ambulanceSource: AudioBufferSourceNode | null = null;
  private policeSource: AudioBufferSourceNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;

  // State
  private isMuted: boolean = true;
  private isSimulationPaused: boolean = false;
  private isInitialized: boolean = false;
  private isDisposed: boolean = false;

  // Audio Buffers
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isPreloading: boolean = false;

  // Countdown timers for intermittent sounds
  private nextHornTimer: number = 3.5; // Responsive initial car horn (3.5s)
  private nextBirdTimer: number = 14.0; // 14-28s (daytime)

  // Master volume configuration
  private readonly targetMasterVolume: number = 0.22;

  constructor() {
    // Lazily initialized on first user interaction
  }

  /**
   * Checks if Web Audio API is supported.
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && (
      'AudioContext' in window || 'webkitAudioContext' in window
    );
  }

  /**
   * Preloads local audio assets asynchronously.
   */
  private async preloadAudioAssets(): Promise<void> {
    if (!this.audioCtx || this.isPreloading || typeof fetch === 'undefined') return;
    this.isPreloading = true;

    const soundFiles: Record<string, string> = {
      traffic_rumble: '/audio/traffic_rumble.wav',
      car_horn: '/audio/car_horn.wav',
      bird_chirp: '/audio/bird_chirp.wav',
      ambulance_siren: '/audio/ambulance_siren.wav',
      police_siren: '/audio/police_siren.wav'
    };

    for (const [key, url] of Object.entries(soundFiles)) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        if (this.audioCtx) {
          const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
          this.audioBuffers.set(key, audioBuffer);
        }
      } catch (err) {
        // Fallback to procedural synthesis for this sound
      }
    }

    // If ambience buffer loaded after initialization, switch ambience loop to the authentic buffer
    if (this.audioBuffers.has('traffic_rumble') && this.audioCtx && this.ambienceGain) {
      this.startAmbienceLoop();
    }
  }

  /**
   * Initializes audio graph.
   */
  private initAudioGraph(): boolean {
    if (this.isInitialized || this.isDisposed) return true;
    if (!this.isSupported()) return false;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      // Master Gain
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);

      // Ambience bus
      this.ambienceGain = this.audioCtx.createGain();
      this.ambienceGain.gain.setValueAtTime(0.55, this.audioCtx.currentTime);
      this.ambienceGain.connect(this.masterGain);

      // SFX bus
      this.sfxGain = this.audioCtx.createGain();
      this.sfxGain.gain.setValueAtTime(0.70, this.audioCtx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Dedicated siren gains with smooth ducking
      this.ambulanceGain = this.audioCtx.createGain();
      this.ambulanceGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
      this.ambulanceGain.connect(this.sfxGain);

      this.policeGain = this.audioCtx.createGain();
      this.policeGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
      this.policeGain.connect(this.sfxGain);

      // Kick off asset preloading
      this.preloadAudioAssets();

      // Start continuous background ambience (procedural fallback or buffer)
      this.startAmbienceLoop();

      this.isInitialized = true;
      return true;
    } catch (e) {
      console.warn('[TrafficAmbienceAudio] Failed to initialize Web Audio graph:', e);
      return false;
    }
  }

  /**
   * Starts or updates continuous background road rumble loop.
   */
  private startAmbienceLoop(): void {
    if (!this.audioCtx || !this.ambienceGain) return;

    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
        this.ambienceSource.disconnect();
      } catch {}
      this.ambienceSource = null;
    }

    const rumbleBuffer = this.audioBuffers.get('traffic_rumble');
    if (rumbleBuffer) {
      const source = this.audioCtx.createBufferSource();
      source.buffer = rumbleBuffer;
      source.loop = true;
      source.connect(this.ambienceGain);
      source.start(0);
      this.ambienceSource = source;
    } else {
      // Procedural fallback filtered noise loop
      const bufferSize = this.audioCtx.sampleRate * 3.0;
      const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.95 * b0 + white * 0.05;
        b1 = 0.85 * b1 + white * 0.15;
        data[i] = (b0 * 0.6 + b1 * 0.25) * 0.35;
      }

      const source = this.audioCtx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, this.audioCtx.currentTime);

      source.connect(filter);
      filter.connect(this.ambienceGain);
      source.start(0);
      this.ambienceSource = source;
    }
  }

  /**
   * Plays a one-shot audio buffer through the SFX bus.
   */
  private playOneShot(name: string, volume: number = 1.0): void {
    if (!this.audioCtx || !this.sfxGain || this.isMuted || this.isSimulationPaused) return;

    const buffer = this.audioBuffers.get(name);
    if (buffer) {
      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      if (name === 'car_horn') {
        // Subtle pitch variation between different vehicle models (sedan vs hatchback vs SUV)
        source.playbackRate.setValueAtTime(0.92 + Math.random() * 0.16, this.audioCtx.currentTime);
      }
      const gain = this.audioCtx.createGain();
      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      source.connect(gain);
      gain.connect(this.sfxGain);
      source.start(0);
    } else {
      // Procedural fallback
      if (name === 'car_horn') {
        this.playProceduralCarHorn(volume);
      } else if (name === 'bird_chirp') {
        this.playProceduralBirdChirp(volume);
      }
    }
  }

  /**
   * Procedural car horn fallback.
   */
  private playProceduralCarHorn(volume: number): void {
    if (!this.audioCtx || !this.sfxGain) return;
    const now = this.audioCtx.currentTime;

    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    const pitchFactor = 0.92 + Math.random() * 0.16;
    osc1.frequency.setValueAtTime(415 * pitchFactor, now);
    osc2.frequency.setValueAtTime(494 * pitchFactor, now);

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume * 0.25, now + 0.02);
    gain.gain.setValueAtTime(volume * 0.25, now + 0.30);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.42);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  }

  /**
   * Procedural bird chirp fallback.
   */
  private playProceduralBirdChirp(volume: number): void {
    if (!this.audioCtx || !this.sfxGain) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3600, now);
    osc.frequency.exponentialRampToValueAtTime(4600, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(3400, now + 0.25);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume * 0.18, now + 0.04);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.30);
  }

  /**
   * Updates emergency sirens, occasional car horns, and bird chirping each frame.
   */
  public update(delta: number, context: AudioUpdateContext): void {
    if (!this.isInitialized || this.isMuted || this.isSimulationPaused || !this.audioCtx) {
      return;
    }

    // 1. Synchronize Emergency Sirens
    this.updateEmergencySirens(context.hasActiveAmbulance, context.hasActivePolice);

    // 2. Occasional Random Car Horns (triggered when vehicles are stopped/waiting)
    this.nextHornTimer -= delta;
    if (this.nextHornTimer <= 0) {
      const waitingCount = context.vehicles.filter(veh => veh.v < 1.0).length;
      if (waitingCount > 0 && context.vehicles.length >= 1) {
        // Honk with dynamic frequency and volume based on queue congestion
        const hornVol = waitingCount >= 3 ? 0.48 : 0.42;
        this.playOneShot('car_horn', hornVol);
        this.nextHornTimer = waitingCount >= 3
          ? (4.0 + Math.random() * 6.0)   // 4-10s when cars are queued up at red
          : (7.0 + Math.random() * 9.0);  // 7-16s normal traffic
      } else {
        // Reschedule soon
        this.nextHornTimer = 3.0 + Math.random() * 4.0;
      }
    }

    // 3. Ambient Bird Sounds (daytime primarily, quiet/rare at night)
    this.nextBirdTimer -= delta;
    if (this.nextBirdTimer <= 0) {
      if (!context.isNight) {
        // Daytime chirp
        this.playOneShot('bird_chirp', 0.28);
        this.nextBirdTimer = 14.0 + Math.random() * 16.0; // 14-30s
      } else {
        // Nighttime is quiet; next check in 45-75s
        this.nextBirdTimer = 45.0 + Math.random() * 30.0;
      }
    }
  }

  /**
   * Smoothly starts, fades, and stops ambulance & police sirens.
   */
  private updateEmergencySirens(hasAmbulance: boolean, hasPolice: boolean): void {
    if (!this.audioCtx || !this.ambulanceGain || !this.policeGain) return;
    const now = this.audioCtx.currentTime;

    // Both sirens active -> duck slightly to prevent clipping
    const ducking = (hasAmbulance && hasPolice) ? 0.70 : 1.0;

    // --- AMBULANCE SIREN ---
    if (hasAmbulance) {
      if (!this.ambulanceSource) {
        this.startAmbulanceSirenLoop();
      }
      this.ambulanceGain.gain.cancelScheduledValues(now);
      this.ambulanceGain.gain.linearRampToValueAtTime(0.55 * ducking, now + 0.35);
    } else {
      if (this.ambulanceSource) {
        this.ambulanceGain.gain.cancelScheduledValues(now);
        this.ambulanceGain.gain.linearRampToValueAtTime(0.0001, now + 0.30);
        // Stop source after fade
        const src = this.ambulanceSource;
        this.ambulanceSource = null;
        setTimeout(() => {
          try {
            src.stop();
            src.disconnect();
          } catch {}
        }, 350);
      }
    }

    // --- POLICE SIREN ---
    if (hasPolice) {
      if (!this.policeSource) {
        this.startPoliceSirenLoop();
      }
      this.policeGain.gain.cancelScheduledValues(now);
      this.policeGain.gain.linearRampToValueAtTime(0.50 * ducking, now + 0.35);
    } else {
      if (this.policeSource) {
        this.policeGain.gain.cancelScheduledValues(now);
        this.policeGain.gain.linearRampToValueAtTime(0.0001, now + 0.30);
        const src = this.policeSource;
        this.policeSource = null;
        setTimeout(() => {
          try {
            src.stop();
            src.disconnect();
          } catch {}
        }, 350);
      }
    }
  }

  private startAmbulanceSirenLoop(): void {
    if (!this.audioCtx || !this.ambulanceGain) return;
    const buffer = this.audioBuffers.get('ambulance_siren');
    if (buffer) {
      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.ambulanceGain);
      src.start(0);
      this.ambulanceSource = src;
    } else {
      // Procedural Two-Tone fallback
      this.startProceduralAmbulanceSiren();
    }
  }

  private startProceduralAmbulanceSiren(): void {
    if (!this.audioCtx || !this.ambulanceGain) return;
    const osc = this.audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(659, this.audioCtx.currentTime);

    // LFO square wave to alternate 659Hz and 880Hz
    const lfo = this.audioCtx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(1.0, this.audioCtx.currentTime);

    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(221, this.audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, this.audioCtx.currentTime);

    osc.connect(filter);
    filter.connect(this.ambulanceGain);

    osc.start(0);
    lfo.start(0);
    this.ambulanceSource = osc as unknown as AudioBufferSourceNode;
  }

  private startPoliceSirenLoop(): void {
    if (!this.audioCtx || !this.policeGain) return;
    const buffer = this.audioBuffers.get('police_siren');
    if (buffer) {
      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.policeGain);
      src.start(0);
      this.policeSource = src;
    } else {
      // Procedural Wail fallback
      this.startProceduralPoliceSiren();
    }
  }

  private startProceduralPoliceSiren(): void {
    if (!this.audioCtx || !this.policeGain) return;
    const osc = this.audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, this.audioCtx.currentTime);

    const lfo = this.audioCtx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(0.42, this.audioCtx.currentTime);

    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(380, this.audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(this.policeGain);
    osc.start(0);
    lfo.start(0);
    this.policeSource = osc as unknown as AudioBufferSourceNode;
  }

  /**
   * Resets all sirens and timers (called when simulation is reset).
   */
  public reset(): void {
    if (this.ambulanceSource) {
      try {
        this.ambulanceSource.stop();
        this.ambulanceSource.disconnect();
      } catch {}
      this.ambulanceSource = null;
    }
    if (this.policeSource) {
      try {
        this.policeSource.stop();
        this.policeSource.disconnect();
      } catch {}
      this.policeSource = null;
    }
    if (this.ambulanceGain && this.audioCtx) {
      this.ambulanceGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
    }
    if (this.policeGain && this.audioCtx) {
      this.policeGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
    }
    this.nextHornTimer = 3.5;
    this.nextBirdTimer = 14.0;
  }

  /**
   * Toggles the mute state.
   */
  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  /**
   * Sets mute state with smooth fade in/out ramps.
   */
  public setMuted(mute: boolean): boolean {
    this.isMuted = mute;

    if (!this.isInitialized && !mute) {
      this.initAudioGraph();
    }

    if (!this.audioCtx || !this.masterGain) {
      return this.isMuted;
    }

    if (this.audioCtx.state === 'suspended' && !mute) {
      this.audioCtx.resume().catch(() => {});
    }

    const now = this.audioCtx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);

    if (this.isMuted || this.isSimulationPaused) {
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.15);
    } else {
      this.masterGain.gain.linearRampToValueAtTime(this.targetMasterVolume, now + 0.30);
    }

    return this.isMuted;
  }

  public isMutedState(): boolean {
    return this.isMuted;
  }

  /**
   * Ducks audio when simulation is paused.
   */
  public setSimulationPaused(paused: boolean): void {
    this.isSimulationPaused = paused;

    if (!this.audioCtx || !this.masterGain || this.isMuted) return;

    const now = this.audioCtx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);

    if (paused) {
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.20);
    } else {
      this.masterGain.gain.linearRampToValueAtTime(this.targetMasterVolume, now + 0.30);
    }
  }

  /**
   * Disposes audio resources cleanly.
   */
  public dispose(): void {
    this.isDisposed = true;
    this.reset();

    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
        this.ambienceSource.disconnect();
      } catch {}
      this.ambienceSource = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }

    this.masterGain = null;
    this.ambienceGain = null;
    this.sfxGain = null;
    this.ambulanceGain = null;
    this.policeGain = null;
    this.audioBuffers.clear();
    this.isInitialized = false;
  }
}
