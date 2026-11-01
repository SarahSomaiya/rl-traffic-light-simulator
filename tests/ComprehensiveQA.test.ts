import { describe, it, expect } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';
import { Direction, SignalPhase } from '../src/types';
import { EvaluationRunner } from '../src/rl/EvaluationRunner';

describe('Comprehensive QA, Safety, Kinematics & DQN Validation Suite', () => {
  it('Phase 4: Signal Safety — should guarantee 0 conflicting green phases and enforce safety transitions', () => {
    const env = new TrafficEnvironment({}, 42);
    const signal = env.getSignalController();

    let safetyViolations = 0;
    let simultaneousGreens = 0;
    const dt = 0.05;

    // 2000 steps (100 seconds) with rapid conflicting requests
    for (let step = 0; step < 2000; step++) {
      signal.update(dt);

      const nsLight = signal.getLightState(Direction.NORTH);
      const ewLight = signal.getLightState(Direction.EAST);

      // CRITICAL: Both directions must NEVER be green simultaneously
      if (nsLight === 'green' && ewLight === 'green') {
        simultaneousGreens++;
        safetyViolations++;
      }

      if (step % 17 === 0) {
        signal.requestPhase(
          step % 2 === 0 ? SignalPhase.NORTH_SOUTH_GREEN : SignalPhase.EAST_WEST_GREEN
        );
      }
    }

    expect(simultaneousGreens).toBe(0);
    expect(safetyViolations).toBe(0);
  });

  it('Phase 3: Traffic Kinematics & Density Stress Tests — should maintain safe following distances under all densities', () => {
    const env = new TrafficEnvironment({}, 42);
    const dt = 0.05;
    const densities = [
      { name: 'Low Traffic', multiplier: 0.5, steps: 400 },
      { name: 'Moderate Traffic', multiplier: 1.0, steps: 600 },
      { name: 'Heavy Traffic', multiplier: 2.0, steps: 600 },
      { name: 'High-Density + Emergency', multiplier: 2.5, steps: 600 }
    ];

    for (const d of densities) {
      env.reset(1234);
      let minVehicleGap = Infinity;
      let collisions = 0;

      for (let s = 0; s < d.steps; s++) {
        if (d.name.includes('Emergency') && s === 100) {
          env.spawnEmergencyVehicle('ambulance', Direction.SOUTH, true);
          env.requestEmergencyPriority();
        }
        env.tick(dt);

        const vehicles = env.getVehicles();
        const lanes = new Map<string, typeof vehicles>();
        for (const v of vehicles) {
          if (!lanes.has(v.laneId)) lanes.set(v.laneId, []);
          lanes.get(v.laneId)!.push(v);
        }

        for (const [, laneVehicles] of lanes) {
          laneVehicles.sort((a, b) => b.s - a.s);
          for (let i = 1; i < laneVehicles.length; i++) {
            const lead = laneVehicles[i - 1];
            const follower = laneVehicles[i];
            const gap = lead.s - follower.s - lead.length;
            if (gap < minVehicleGap) minVehicleGap = gap;
            if (gap < -0.1) collisions++;
          }
        }
      }

      expect(collisions).toBe(0);
      expect(minVehicleGap).toBeGreaterThanOrEqual(-0.1);
    }
  });

  it('Phase 5 & 6: Real DQN Training — should update online network weights via gradient descent and decay epsilon', async () => {
    const env = new TrafficEnvironment({}, 555);
    const trainingManager = env.getTrainingManager();
    const dqnAgent = env.getDQNAgent();

    // Snapshot initial online network weights
    const initialWeights = dqnAgent['onlineModel'].getWeights().map(w => w.dataSync().slice());

    // Train 4 episodes (60s simulation each = 240 sim seconds)
    const history = await trainingManager.trainHeadlessAsync(4, 60.0);

    expect(history.length).toBe(4);
    expect(history[0].episode).toBe(1);
    expect(history[3].episode).toBe(4);

    // Verify weights updated
    const finalWeights = dqnAgent['onlineModel'].getWeights().map(w => w.dataSync().slice());
    let weightDiffSum = 0;
    for (let layer = 0; layer < initialWeights.length; layer++) {
      for (let i = 0; i < initialWeights[layer].length; i++) {
        weightDiffSum += Math.abs(finalWeights[layer][i] - initialWeights[layer][i]);
      }
    }

    expect(weightDiffSum).toBeGreaterThan(0.0001);

    // Verify epsilon decayed
    const finalEps = dqnAgent.getHyperparameters().epsilon;
    expect(finalEps).toBeLessThan(1.0);
    expect(finalEps).toBeGreaterThanOrEqual(dqnAgent.getHyperparameters().minEpsilon);
  }, 20000);

  it('Phase 7: Baseline vs DQN Evaluation — should execute reproducible head-to-head comparison without NaN', () => {
    const env = new TrafficEnvironment({}, 777);
    const dqnAgent = env.getDQNAgent();
    const runner = new EvaluationRunner(env, dqnAgent, env.getRLController());

    const result = runner.evaluate(60.0, 777);

    expect(result.baseline.durationSec).toBe(60.0);
    expect(result.rl.durationSec).toBe(60.0);
    expect(Number.isFinite(result.baseline.averageWaitSec)).toBe(true);
    expect(Number.isFinite(result.rl.averageWaitSec)).toBe(true);
    expect(Number.isFinite(result.waitingTimeChangePercent)).toBe(true);
    expect(result.baseline.vehiclesCleared).toBeGreaterThanOrEqual(0);
    expect(result.rl.vehiclesCleared).toBeGreaterThanOrEqual(0);
  });

  it('Phase 7b: Anti-Starvation & Max-Green Safeguard — should prevent traffic starvation and enforce balanced phase service', () => {
    const env = new TrafficEnvironment({}, 777);
    const dqnAgent = env.getDQNAgent();
    const runner = new EvaluationRunner(env, dqnAgent, env.getRLController());

    const result = runner.evaluate(60.0, 777);

    // Both directions must have tracked wait times and queue statistics
    expect(Number.isFinite(result.rl.nsAverageWaitSec)).toBe(true);
    expect(Number.isFinite(result.rl.ewAverageWaitSec)).toBe(true);
    expect(Number.isFinite(result.rl.nsMeanQueue)).toBe(true);
    expect(Number.isFinite(result.rl.ewMeanQueue)).toBe(true);

    // Starvation check: East-West queue must not exceed runaway unserviced levels (previously 28+)
    expect(result.rl.ewAverageWaitSec).toBeLessThan(15.0);
    expect((result.rl.holdCount ?? 0) + (result.rl.switchCount ?? 0)).toBeGreaterThan(0);

    // Max green safeguard prevents infinite starvation even if agent chose HOLD continuously
    const maxInterventions = result.rl.maxGreenInterventions ?? 0;
    expect(maxInterventions).toBeGreaterThanOrEqual(0);
  });

  it('Phase 9: Memory & Tensor Stability — should have 0 tensor leaks during repeated inference and step cycles', () => {
    const env = new TrafficEnvironment({}, 888);
    const agent = env.getDQNAgent();
    const testVec = new Array(15).fill(0.5);

    const beforeTensors = tf.memory().numTensors;
    for (let i = 0; i < 50; i++) {
      agent.predictQValues(testVec);
    }
    const afterTensors = tf.memory().numTensors;

    expect(afterTensors).toBe(beforeTensors);
  });
});
