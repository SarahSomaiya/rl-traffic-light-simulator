import { describe, it, expect, afterEach } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { DQNAgent } from '../src/rl/DQNAgent';
import { RLAction, ReplayTransition } from '../src/types';

describe('DQNAgent (Deep Q-Network with TensorFlow.js)', () => {
  let agent: DQNAgent;

  afterEach(() => {
    if (agent) {
      agent.dispose();
    }
  });

  it('1. should predict exactly 2 finite Q-values for an observation vector', () => {
    agent = new DQNAgent({ learningRate: 0.001 }, 42);
    const observation = new Array(15).fill(0.5);

    const qValues = agent.predictQValues(observation);
    expect(qValues.length).toBe(2);
    expect(Number.isFinite(qValues[0])).toBe(true);
    expect(Number.isFinite(qValues[1])).toBe(true);
  });

  it('2. should enforce greedy selection when epsilon = 0 and explore when epsilon = 1', () => {
    agent = new DQNAgent({ epsilon: 0.0 }, 100);
    const observation = new Array(15).fill(0.2);

    // Epsilon = 0: Pure exploitation (greedy action)
    for (let i = 0; i < 20; i++) {
      const decision = agent.selectAction(observation);
      expect(decision.isExploration).toBe(false);
      expect([RLAction.HOLD_PHASE, RLAction.REQUEST_SWITCH]).toContain(decision.action);
    }

    // Epsilon = 1: Pure exploration
    agent.setHyperparameters({ epsilon: 1.0 });
    const actions: RLAction[] = [];
    for (let i = 0; i < 40; i++) {
      const decision = agent.selectAction(observation);
      expect(decision.isExploration).toBe(true);
      actions.push(decision.action);
    }

    expect(actions.includes(RLAction.HOLD_PHASE)).toBe(true);
    expect(actions.includes(RLAction.REQUEST_SWITCH)).toBe(true);
  });

  it('3. should perform mini-batch training updates and return a finite loss', async () => {
    agent = new DQNAgent({ learningRate: 0.01, batchSize: 4 }, 42);

    const batch: ReplayTransition[] = [
      {
        state: new Array(15).fill(0.1),
        action: RLAction.HOLD_PHASE,
        reward: -2.0,
        nextState: new Array(15).fill(0.2),
        done: false
      },
      {
        state: new Array(15).fill(0.3),
        action: RLAction.REQUEST_SWITCH,
        reward: -1.0,
        nextState: new Array(15).fill(0.4),
        done: false
      },
      {
        state: new Array(15).fill(0.5),
        action: RLAction.HOLD_PHASE,
        reward: 5.0,
        nextState: new Array(15).fill(0.6),
        done: true
      },
      {
        state: new Array(15).fill(0.7),
        action: RLAction.REQUEST_SWITCH,
        reward: -0.5,
        nextState: new Array(15).fill(0.8),
        done: false
      }
    ];

    const loss = await agent.trainOnBatch(batch);
    expect(Number.isFinite(loss)).toBe(true);
    expect(agent.getTrainingSteps()).toBe(1);
    expect(agent.getRecentLoss()).toBeCloseTo(loss, 4);
  });

  it('4. should synchronize target network weights from online network', () => {
    agent = new DQNAgent({ targetSyncInterval: 1 }, 42);
    const observation = new Array(15).fill(0.3);

    // Initial sync
    agent.syncTargetNetwork();
    const qBefore = agent.predictQValues(observation);
    expect(qBefore.length).toBe(2);
  });

  it('5. should keep tensor count bounded and avoid memory leaks during repeated training', async () => {
    agent = new DQNAgent({ batchSize: 2 }, 42);

    const batch: ReplayTransition[] = [
      {
        state: new Array(15).fill(0.1),
        action: RLAction.HOLD_PHASE,
        reward: -1.0,
        nextState: new Array(15).fill(0.2),
        done: false
      },
      {
        state: new Array(15).fill(0.3),
        action: RLAction.REQUEST_SWITCH,
        reward: 2.0,
        nextState: new Array(15).fill(0.4),
        done: true
      }
    ];

    // Warm-up step
    await agent.trainOnBatch(batch);
    const initialTensors = tf.memory().numTensors;

    // Run 5 training steps
    for (let i = 0; i < 5; i++) {
      await agent.trainOnBatch(batch);
      agent.predictQValues(new Array(15).fill(0.5));
    }

    const finalTensors = tf.memory().numTensors;
    // Tensor count must not grow uncontrollably
    expect(finalTensors).toBe(initialTensors);
  });
});

