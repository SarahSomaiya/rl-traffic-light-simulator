import './style.css';
import { SceneManager } from './renderer/SceneManager';
import { CameraPreset, SignalPhase } from './types';

let sceneManager: SceneManager | null = null;
let telemetryIntervalId: number | null = null;

// Initialize 3D scene and wire simulation controls when DOM is ready
function initApp(): void {
  const container = document.getElementById('canvas-container');
  if (container) {
    try {
      sceneManager = new SceneManager({ container });
      console.log('[RL Traffic Light Simulator] Phase 3: Traffic Engine & 3D Integration ready.');

      const statusEl = document.getElementById('system-status');
      if (statusEl) {
        statusEl.innerHTML = '<span class="status-dot"></span> Traffic Engine Active';
      }

      const env = sceneManager.getTrafficEnvironment();
      const signalCtrl = env.getSignalController();

      // 1. HUD Panel Collapse Toggle
      const toggleBtn = document.getElementById('btn-toggle-hud');
      const cardBody = document.getElementById('card-body');
      if (toggleBtn && cardBody) {
        toggleBtn.addEventListener('click', () => {
          const isCollapsed = cardBody.classList.toggle('collapsed');
          toggleBtn.textContent = isCollapsed ? '+' : '−';
        });
      }

      // 2. Camera Preset Toolbar
      const presetButtons = document.querySelectorAll<HTMLButtonElement>('.btn-preset');
      const camController = sceneManager.getCameraController();

      const updatePresetButtonsUI = (activePreset: CameraPreset | null) => {
        presetButtons.forEach(btn => {
          if (activePreset && btn.dataset.preset === activePreset) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
      };

      camController.onPresetChange = updatePresetButtonsUI;

      presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = btn.dataset.preset as CameraPreset;
          if (preset && sceneManager) {
            sceneManager.getCameraController().setPreset(preset, true);
          }
        });
      });

      // 3. Simulation Play / Pause / Reset Controls
      const playPauseBtn = document.getElementById('btn-sim-playpause');
      const resetBtn = document.getElementById('btn-sim-reset');

      if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
          const isPlaying = env.togglePlayPause();
          playPauseBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
          playPauseBtn.classList.toggle('active-pause', !isPlaying);
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (sceneManager) {
            sceneManager.resetSimulation();
            if (playPauseBtn) {
              playPauseBtn.textContent = '⏸ Pause';
              playPauseBtn.classList.remove('active-pause');
            }
          }
        });
      }

      // Speed Multipliers (1x, 2x, 5x)
      const speedButtons = document.querySelectorAll<HTMLButtonElement>('.btn-speed');
      speedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const speed = parseFloat(btn.dataset.speed ?? '1');
          env.setSpeedMultiplier(speed);

          speedButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      // 4. Safe Signal Phase Requests
      const btnNsGreen = document.getElementById('btn-sig-ns-green');
      const btnEwGreen = document.getElementById('btn-sig-ew-green');
      const btnToggleCycle = document.getElementById('btn-sig-toggle-cycle');

      if (btnNsGreen) {
        btnNsGreen.addEventListener('click', () => {
          signalCtrl.requestPhase(SignalPhase.NORTH_SOUTH_GREEN);
        });
      }

      if (btnEwGreen) {
        btnEwGreen.addEventListener('click', () => {
          signalCtrl.requestPhase(SignalPhase.EAST_WEST_GREEN);
        });
      }

      if (btnToggleCycle) {
        btnToggleCycle.addEventListener('click', () => {
          const isAuto = !signalCtrl.isAutoCycle();
          signalCtrl.setAutoCycle(isAuto);
          btnToggleCycle.textContent = isAuto ? 'Cycle: Auto (20s)' : 'Cycle: Manual Hold';
        });
      }

      // 5. Emergency Vehicles & Priority Controls
      const btnSpawnAmbulance = document.getElementById('btn-spawn-ambulance');
      const btnSpawnPolice = document.getElementById('btn-spawn-police');
      const btnReqPriority = document.getElementById('btn-req-priority');

      if (btnSpawnAmbulance) {
        btnSpawnAmbulance.addEventListener('click', () => {
          env.spawnEmergencyVehicle('ambulance', undefined, true);
        });
      }

      if (btnSpawnPolice) {
        btnSpawnPolice.addEventListener('click', () => {
          env.spawnEmergencyVehicle('police', undefined, false);
        });
      }

      if (btnReqPriority) {
        btnReqPriority.addEventListener('click', () => {
          env.requestEmergencyPriority();
        });
      }

      // 6. Telemetry HUD Polling (updated at 10 Hz)
      const activeCountEl = document.getElementById('metric-active-count');
      const passedCountEl = document.getElementById('metric-passed-count');
      const phaseBadgeEl = document.getElementById('metric-signal-phase');
      const avgWaitEl = document.getElementById('metric-avg-wait');

      // Enforcement & Emergency elements
      const cameraCountEl = document.getElementById('metric-camera-count');
      const violationCountEl = document.getElementById('metric-violation-count');
      const violationEntriesEl = document.getElementById('violation-entries');
      const emergencyBadgeEl = document.getElementById('badge-emergency-status');

      // Fleet count elements
      const fleetEls: Record<string, HTMLElement | null> = {
        sedan: document.getElementById('fleet-sedan'),
        hatchback: document.getElementById('fleet-hatchback'),
        suv: document.getElementById('fleet-suv'),
        taxi: document.getElementById('fleet-taxi'),
        van: document.getElementById('fleet-van'),
        police: document.getElementById('fleet-police'),
        ambulance: document.getElementById('fleet-ambulance')
      };

      const phaseNames: Record<SignalPhase, { text: string; cssClass: string }> = {
        [SignalPhase.NORTH_SOUTH_GREEN]: { text: 'NS Green', cssClass: '' },
        [SignalPhase.NORTH_SOUTH_YELLOW]: { text: 'NS Yellow', cssClass: 'yellow' },
        [SignalPhase.ALL_RED_NS_TO_EW]: { text: 'All Red Buffer', cssClass: 'all-red' },
        [SignalPhase.EAST_WEST_GREEN]: { text: 'EW Green', cssClass: '' },
        [SignalPhase.EAST_WEST_YELLOW]: { text: 'EW Yellow', cssClass: 'yellow' },
        [SignalPhase.ALL_RED_EW_TO_NS]: { text: 'All Red Buffer', cssClass: 'all-red' }
      };

      if (telemetryIntervalId !== null) {
        window.clearInterval(telemetryIntervalId);
      }

      telemetryIntervalId = window.setInterval(() => {
        const metrics = env.getMetrics();
        const activeVehicles = env.getVehicles();

        if (activeCountEl) {
          activeCountEl.textContent = String(activeVehicles.length);
        }
        if (passedCountEl) {
          passedCountEl.textContent = String(metrics.totalVehiclesPassed);
        }
        if (avgWaitEl) {
          avgWaitEl.textContent = `${metrics.averageWaitTimeSec.toFixed(1)}s`;
        }
        if (phaseBadgeEl) {
          const info = phaseNames[signalCtrl.getPhase()];
          phaseBadgeEl.textContent = info.text;
          phaseBadgeEl.className = `badge phase-badge ${info.cssClass}`.trim();
        }

        // Speed Enforcement Telemetry
        const speedCameras = env.getSpeedCameras();
        const violations = env.getViolations();

        if (cameraCountEl) {
          cameraCountEl.textContent = String(speedCameras.length);
        }
        if (violationCountEl) {
          violationCountEl.textContent = String(violations.length);
        }

        if (violationEntriesEl) {
          if (violations.length === 0) {
            violationEntriesEl.innerHTML = '<div class="no-violations-hint">No speeding violations detected yet.</div>';
          } else {
            // Show recent 3 violations
            const recent = violations.slice(-3).reverse();
            violationEntriesEl.innerHTML = recent
              .map(
                v => `
                <div class="violation-item">
                  <span>${v.vehicleType.toUpperCase()} (${v.cameraId.replace('cam_', '')})</span>
                  <span><b>${v.measuredSpeedKmh} km/h</b> (+${v.excessSpeedKmh})</span>
                </div>`
              )
              .join('');
          }
        }

        // Emergency Vehicle Telemetry
        const emergencyInfo = env.getActiveEmergencyInfo();
        if (emergencyBadgeEl) {
          if (emergencyInfo) {
            emergencyBadgeEl.textContent = `🚨 ${emergencyInfo.type.toUpperCase()} on ${emergencyInfo.direction} (${emergencyInfo.distanceToStopLine}m)`;
            emergencyBadgeEl.className = 'badge emergency-badge-status active';
          } else {
            emergencyBadgeEl.textContent = 'Status: Normal';
            emergencyBadgeEl.className = 'badge emergency-badge-status';
          }
        }

        // Fleet Distribution Telemetry
        const fleetDist = env.getFleetDistribution();
        for (const [key, el] of Object.entries(fleetEls)) {
          if (el) {
            el.textContent = String((fleetDist as any)[key] ?? 0);
          }
        }
      }, 100);
    } catch (err) {
      console.error('[RL Traffic Light Simulator] Failed to initialize scene:', err);
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

export function getSystemInfo(): { status: string; phase: number; timestamp: number } {
  return {
    status: 'ready',
    phase: 1,
    timestamp: Date.now()
  };
}

export function getSceneManager(): SceneManager | null {
  return sceneManager;
}
