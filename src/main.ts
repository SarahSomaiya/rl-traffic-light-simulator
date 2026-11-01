import './style.css';
import { SceneManager } from './renderer/SceneManager';
import { CameraPreset, SignalPhase } from './types';

let sceneManager: SceneManager | null = null;
let telemetryIntervalId: number | null = null;

// Initialize 3D scene and wire simulation controls when DOM is ready
function initApp(): void {
  if (sceneManager) {
    console.warn('[RL Traffic Light Simulator] App already initialized; skipping duplicate setup.');
    return;
  }
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
          sceneManager?.getAmbienceAudio().setSimulationPaused(!isPlaying);
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

      // 4. Day / Night Environment & Ambience Audio Controls
      const btnDayNight = document.getElementById('btn-env-daynight');
      const envIcon = document.getElementById('env-icon');
      const envText = document.getElementById('env-text');
      if (btnDayNight && sceneManager) {
        const envCtrl = sceneManager.getEnvironmentController();
        btnDayNight.addEventListener('click', () => {
          const isNight = envCtrl.toggleDayNight();
          if (envIcon) envIcon.textContent = isNight ? '🌙' : '☀️';
          if (envText) envText.textContent = isNight ? 'Night' : 'Day';
          btnDayNight.classList.toggle('active-night', isNight);
        });
      }

      const btnAudio = document.getElementById('btn-audio-ambience');
      const audioIcon = document.getElementById('audio-icon');
      const audioText = document.getElementById('audio-text');
      if (btnAudio && sceneManager) {
        const audio = sceneManager.getAmbienceAudio();
        btnAudio.addEventListener('click', () => {
          const isMuted = audio.toggleMute();
          if (audioIcon) audioIcon.textContent = isMuted ? '🔇' : '🔊';
          if (audioText) audioText.textContent = isMuted ? 'Muted' : 'Ambience';
          btnAudio.classList.toggle('active-audio', !isMuted);
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
          signalCtrl.requestPhase(SignalPhase.NORTH_SOUTH_GREEN, 'MANUAL_REQUEST');
        });
      }

      if (btnEwGreen) {
        btnEwGreen.addEventListener('click', () => {
          signalCtrl.requestPhase(SignalPhase.EAST_WEST_GREEN, 'MANUAL_REQUEST');
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
          env.spawnEmergencyVehicle('police', undefined, true);
        });
      }

      if (btnReqPriority) {
        btnReqPriority.addEventListener('click', () => {
          env.requestEmergencyPriority();
        });
      }

      // Reinforcement Learning: Deep Q-Network (DQN) Setup
      const rlController = env.getRLController();
      const dqnAgent = env.getDQNAgent();
      const trainingManager = env.getTrainingManager();

      // Controller Mode Switcher
      const btnModeAuto = document.getElementById('btn-mode-auto');
      const btnModeRL = document.getElementById('btn-mode-rl');
      const rlModeBadgeEl = document.getElementById('badge-rl-mode');

      const setModeUI = (mode: 'AUTOMATIC' | 'RL_AGENT') => {
        rlController.setMode(mode);
        if (btnModeAuto && btnModeRL) {
          btnModeAuto.classList.toggle('active', mode === 'AUTOMATIC');
          btnModeRL.classList.toggle('active', mode === 'RL_AGENT');
        }
      };

      if (btnModeAuto) {
        btnModeAuto.addEventListener('click', () => setModeUI('AUTOMATIC'));
      }
      if (btnModeRL) {
        btnModeRL.addEventListener('click', () => setModeUI('RL_AGENT'));
      }

      // Training & Evaluation Buttons
      const btnStartTrain = document.getElementById('btn-rl-start-train');
      const btnPauseTrain = document.getElementById('btn-rl-pause-train');
      const btnStopTrain = document.getElementById('btn-rl-stop-train');
      const btnResetQ = document.getElementById('btn-rl-reset-q');
      const btnEval = document.getElementById('btn-rl-eval');
      const btnCloseEval = document.getElementById('btn-close-eval');
      const evalBox = document.getElementById('eval-results-box');

      if (btnStartTrain) {
        btnStartTrain.addEventListener('click', () => {
          trainingManager.startTraining(20);
          if (btnPauseTrain) btnPauseTrain.textContent = '⏸ Pause';
        });
      }

      if (btnPauseTrain) {
        btnPauseTrain.addEventListener('click', () => {
          if (trainingManager.getState() === 'TRAINING') {
            trainingManager.pauseTraining();
            btnPauseTrain.textContent = '▶ Resume';
          } else if (trainingManager.getState() === 'PAUSED') {
            trainingManager.resumeTraining();
            btnPauseTrain.textContent = '⏸ Pause';
          }
        });
      }

      if (btnStopTrain) {
        btnStopTrain.addEventListener('click', () => {
          trainingManager.stopTraining();
          setModeUI('AUTOMATIC');
          if (btnPauseTrain) btnPauseTrain.textContent = '⏸ Pause';
        });
      }

      if (btnResetQ) {
        btnResetQ.addEventListener('click', () => {
          env.resetModel();
        });
      }

      if (btnEval) {
        btnEval.addEventListener('click', async () => {
          const { EvaluationRunner } = await import('./rl/EvaluationRunner');
          const runner = new EvaluationRunner(env, dqnAgent, rlController);
          btnEval.textContent = 'Evaluating...';
          (btnEval as HTMLButtonElement).disabled = true;

          // Run evaluation headlessly over identical 60s scenario
          setTimeout(() => {
            const result = runner.evaluate(60.0, 777);

            const baseWaitEl = document.getElementById('eval-base-wait');
            const rlWaitEl = document.getElementById('eval-rl-wait');
            const baseClearEl = document.getElementById('eval-base-cleared');
            const rlClearEl = document.getElementById('eval-rl-cleared');
            const baseQueueEl = document.getElementById('eval-base-queue');
            const rlQueueEl = document.getElementById('eval-rl-queue');
            const baseRewardEl = document.getElementById('eval-base-reward');
            const rlRewardEl = document.getElementById('eval-rl-reward');
            const conclusionEl = document.getElementById('eval-summary-conclusion');

            if (baseWaitEl) baseWaitEl.textContent = `${result.baseline.averageWaitSec.toFixed(1)}s`;
            if (rlWaitEl) rlWaitEl.textContent = `${result.rl.averageWaitSec.toFixed(1)}s`;
            if (baseClearEl) baseClearEl.textContent = String(result.baseline.vehiclesCleared);
            if (rlClearEl) rlClearEl.textContent = String(result.rl.vehiclesCleared);
            if (baseQueueEl) baseQueueEl.textContent = String(result.baseline.meanQueue);
            if (rlQueueEl) rlQueueEl.textContent = String(result.rl.meanQueue);
            if (baseRewardEl) baseRewardEl.textContent = result.baseline.totalReward.toFixed(1);
            if (rlRewardEl) rlRewardEl.textContent = result.rl.totalReward.toFixed(1);

            if (conclusionEl) {
              const diff = result.waitingTimeChangePercent;
              const sign = diff <= 0 ? '' : '+';
              conclusionEl.textContent = `Avg Wait Time Change: ${sign}${diff}% (DQN vs Base)`;
              conclusionEl.style.color = diff <= 0 ? 'var(--accent-green)' : 'var(--accent-amber)';
            }

            if (evalBox) evalBox.style.display = 'block';
            btnEval.textContent = '⚖ Eval vs Base';
            (btnEval as HTMLButtonElement).disabled = false;
          }, 50);
        });
      }

      if (btnCloseEval && evalBox) {
        btnCloseEval.addEventListener('click', () => {
          evalBox.style.display = 'none';
        });
      }

      // Chart Drawing Helper
      const chartCanvas = document.getElementById('dqn-chart') as HTMLCanvasElement | null;
      const drawChart = () => {
        if (!chartCanvas) return;
        const ctx = chartCanvas.getContext('2d');
        if (!ctx) return;

        const w = chartCanvas.width;
        const h = chartCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const history = trainingManager.getEpisodeHistory();
        if (history.length === 0) {
          ctx.fillStyle = '#64748b';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('No training episode history yet. Click [Train] to start.', w / 2, h / 2 + 3);
          return;
        }

        // Compute min & max bounds
        const rawRewards = history.map(m => m.totalReward);
        const movRewards = history.map(m => m.movingAverageReward ?? m.totalReward);
        const allVals = [...rawRewards, ...movRewards];
        const minVal = Math.min(...allVals, 0);
        const maxVal = Math.max(...allVals, 10);
        const range = maxVal - minVal || 1;

        const padLeft = 35;
        const padRight = 10;
        const padTop = 10;
        const padBottom = 15;
        const plotW = w - padLeft - padRight;
        const plotH = h - padTop - padBottom;

        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, padTop);
        ctx.lineTo(w - padRight, padTop);
        ctx.moveTo(padLeft, padTop + plotH / 2);
        ctx.lineTo(w - padRight, padTop + plotH / 2);
        ctx.moveTo(padLeft, h - padBottom);
        ctx.lineTo(w - padRight, h - padBottom);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = '#64748b';
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(maxVal.toFixed(0), padLeft - 4, padTop + 4);
        ctx.fillText(((maxVal + minVal) / 2).toFixed(0), padLeft - 4, padTop + plotH / 2 + 3);
        ctx.fillText(minVal.toFixed(0), padLeft - 4, h - padBottom);

        const getX = (idx: number) =>
          history.length === 1 ? padLeft + plotW / 2 : padLeft + (idx / (history.length - 1)) * plotW;
        const getY = (val: number) => h - padBottom - ((val - minVal) / range) * plotH;

        // 1. Plot raw total rewards (cyan)
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        rawRewards.forEach((r, idx) => {
          const x = getX(idx);
          const y = getY(r);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 2. Plot moving average rewards (amber)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        movRewards.forEach((r, idx) => {
          const x = getX(idx);
          const y = getY(r);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Points
        rawRewards.forEach((r, idx) => {
          const x = getX(idx);
          const y = getY(r);
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      };

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

      // RL Telemetry elements
      const rlStateStrEl = document.getElementById('rl-state-str');
      const rlActionStrEl = document.getElementById('rl-action-str');
      const rlQValuesEl = document.getElementById('rl-q-values');
      const rlRewardValEl = document.getElementById('rl-reward-val');
      const rlTrainProgressEl = document.getElementById('rl-train-progress');

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

        // Deep Q-Network (DQN) Telemetry
        const rlTele = rlController.getTelemetry();
        const trainState = trainingManager.getState();
        const eps = rlTele.epsilon;

        if (rlModeBadgeEl) {
          if (trainState === 'TRAINING') {
            const p = trainingManager.getEpisodeProgress();
            rlModeBadgeEl.textContent = `Training: Ep ${p.currentEpisode}/20 (${p.percent}%)`;
          } else if (trainState === 'PAUSED') {
            rlModeBadgeEl.textContent = 'Training: Paused';
          } else if (rlController.getMode() === 'RL_AGENT') {
            rlModeBadgeEl.textContent = 'Mode: DQN Agent Active';
          } else if (rlController.getMode() === 'EVALUATION') {
            rlModeBadgeEl.textContent = 'Mode: Evaluation';
          } else {
            rlModeBadgeEl.textContent = 'Mode: Fixed-Time';
          }
        }

        if (rlStateStrEl) {
          if (rlTele.observation) {
            const raw = rlTele.observation.raw;
            const elapsed = signalCtrl.getPhaseElapsed().toFixed(1);
            rlStateStrEl.textContent = `NS: ${raw.nsQueueLength} | EW: ${raw.ewQueueLength} | ${raw.greenDirection} (${elapsed}s) [${rlTele.lastSwitchReason}]`;
          } else {
            rlStateStrEl.textContent = rlController.getMode() === 'AUTOMATIC' ? 'Fixed-Time (20s Auto)' : 'Waiting Decision...';
          }
        }

        if (rlActionStrEl) {
          if (rlTele.action !== null) {
            const actName = rlTele.action === 0 ? 'HOLD_PHASE' : 'REQUEST_SWITCH';
            const policyType = rlTele.isExploration ? '🎲 Exploration' : '🧠 Exploitation';
            rlActionStrEl.textContent = `${actName} (${policyType}) [H:${rlTele.holdActionCount} S:${rlTele.switchActionCount}]`;
          } else {
            rlActionStrEl.textContent = '—';
          }
        }

        if (rlQValuesEl) {
          const [holdQ, switchQ] = rlTele.qValues;
          const signH = holdQ >= 0 ? '+' : '';
          const signS = switchQ >= 0 ? '+' : '';
          rlQValuesEl.textContent = `H: ${signH}${holdQ.toFixed(2)} | SW: ${signS}${switchQ.toFixed(2)}`;
        }

        if (rlRewardValEl) {
          const epReward = trainingManager.getCumulativeReward();
          const movAvg = trainingManager.getMovingAverageReward();
          rlRewardValEl.textContent = `Step: ${rlTele.reward.toFixed(2)} | Ep: ${epReward.toFixed(1)} (Avg: ${movAvg.toFixed(1)})`;
        }

        if (rlTrainProgressEl) {
          rlTrainProgressEl.textContent = `Buf: ${rlTele.replayBufferSize} | Loss: ${rlTele.recentLoss.toFixed(4)} | ε: ${eps.toFixed(2)} | MaxG: ${rlTele.maxGreenInterventions}`;
        }

        // Redraw training performance chart
        drawChart();
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
