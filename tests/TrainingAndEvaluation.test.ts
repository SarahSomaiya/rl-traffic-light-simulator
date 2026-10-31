import { describe, it, expect } from 'vitest';
import { TrafficEnvironment } from '../src/sim/TrafficEnvironment';
import { EvaluationRunner } from '../src/rl/EvaluationRunner';

describe('TrainingManager & Evaluation Benchmark', () => {
  it('1. should preserve learned model weights across environment and episode resets', () => {
    const env = new TrafficEnvironment({}, 42);
    const agent = env.getDQNAgent();

    const sampleVector = new Array(15).fill(0.5);
    const qBefore = agent.predictQValues(sampleVector);
    expect(qBefore.length).toBe(2);

    // Environment reset (such as between episodes) must NOT wipe learned weights!
    env.reset(99);
    const qAfterEnvReset = agent.predictQValues(sampleVector);
    expect(qAfterEnvReset[0]).toBeCloseTo(qBefore[0], 4);
    expect(qAfterEnvReset[1]).toBeCloseTo(qBefore[1], 4);

    // Only explicit model reset reinitializes weights
    env.resetModel();
    const qAfterReset = agent.predictQValues(sampleVector);
    expect(qAfterReset.length).toBe(2);
  });

  it('2. should run training episodes and decay epsilon across completed episodes', () => {
    const env = new TrafficEnvironment({}, 100);
    const trainingManager = env.getTrainingManager();
    const agent = env.getRLAgent();

    const initialEps = agent.getHyperparameters().epsilon;
    expect(initialEps).toBe(1.0);

    // Run 2 short headless training episodes (each 10 seconds)
    const history = trainingManager.trainHeadless(2, 10.0);

    expect(history.length).toBe(2);
    expect(history[0].episode).toBe(1);
    expect(history[1].episode).toBe(2);

    // Epsilon must have decayed after 2 episodes
    const epsAfter = agent.getHyperparameters().epsilon;
    expect(epsAfter).toBeLessThan(initialEps);
  });

  it('3. should support training pause, resume, and stop', () => {
    const env = new TrafficEnvironment({}, 42);
    const trainingManager = env.getTrainingManager();

    expect(trainingManager.getState()).toBe('IDLE');

    trainingManager.startTraining(5);
    expect(trainingManager.getState()).toBe('TRAINING');

    trainingManager.pauseTraining();
    expect(trainingManager.getState()).toBe('PAUSED');

    trainingManager.resumeTraining();
    expect(trainingManager.getState()).toBe('TRAINING');

    trainingManager.stopTraining();
    expect(trainingManager.getState()).toBe('IDLE');
  });

  it('4. should run fair evaluation comparing baseline vs RL agent with reproducible results', () => {
    const env = new TrafficEnvironment({}, 555);
    const agent = env.getRLAgent();
    const controller = env.getRLController();
    const runner = new EvaluationRunner(env, agent, controller);

    // Run 20s comparison
    const result = runner.evaluate(20.0, 555);

    expect(result.baseline).toBeDefined();
    expect(result.rl).toBeDefined();
    expect(result.baseline.durationSec).toBe(20.0);
    expect(result.rl.durationSec).toBe(20.0);
    expect(typeof result.waitingTimeChangePercent).toBe('number');
    expect(typeof result.throughputChangePercent).toBe('number');
  });
});
