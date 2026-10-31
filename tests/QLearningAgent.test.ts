import { describe, it, expect } from 'vitest';
import { QLearningAgent } from '../src/rl/QLearningAgent';
import { RLAction } from '../src/types';

describe('QLearningAgent (Tabular Q-Learning)', () => {
  it('1. should perform exact Q-learning numerical update matching manual calculation', () => {
    const agent = new QLearningAgent({
      alpha: 0.20,
      gamma: 0.90,
      epsilon: 0.0 // pure exploitation
    });

    const s = 5;
    const nextS = 10;
    const action = RLAction.HOLD_PHASE; // action 0

    // Manually set initial Q-values using update or verify initial 0
    // Initially Q(s, a) = 0.0, Q(nextS) = [0.0, 0.0]
    // Let's seed nextS with Q(nextS, switch) = 4.0 and Q(nextS, hold) = 2.0
    // To set up Q(nextS) = [2.0, 4.0]:
    agent.update(nextS, RLAction.HOLD_PHASE, 2.0 / 0.2, 0, true);
    agent.update(nextS, RLAction.REQUEST_SWITCH, 4.0 / 0.2, 0, true);
    expect(agent.getQValues(nextS)[0]).toBeCloseTo(2.0, 4);
    expect(agent.getQValues(nextS)[1]).toBeCloseTo(4.0, 4);

    // Seed s with initial Q(s, action) = 1.0
    agent.update(s, action, 1.0 / 0.2, 0, true);
    expect(agent.getQValues(s)[0]).toBeCloseTo(1.0, 4);

    // Now execute target transition:
    // s -> action -> r = -3.0 -> nextS
    // Expected:
    // TD Target = r + gamma * max(Q(nextS)) = -3.0 + 0.9 * 4.0 = 0.6
    // TD Error = Target - Q(s, a) = 0.6 - 1.0 = -0.4
    // Q_new = Q(s, a) + alpha * TD Error = 1.0 + 0.2 * (-0.4) = 0.92
    const tdError = agent.update(s, action, -3.0, nextS, false);
    expect(tdError).toBeCloseTo(-0.4, 4);
    expect(agent.getQValues(s)[0]).toBeCloseTo(0.92, 4);
  });

  it('2. should not bootstrap from next state on terminal transitions', () => {
    const agent = new QLearningAgent({
      alpha: 0.25,
      gamma: 0.95,
      epsilon: 0.0
    });

    const s = 20;
    const nextS = 30;
    // Set nextS to high Q value
    agent.update(nextS, RLAction.HOLD_PHASE, 100.0, 0, true);

    // Terminal update from s with r = -4.0:
    // TD Target must be r = -4.0 (ignoring gamma * maxQ(nextS)!)
    // Q_new = 0.0 + 0.25 * (-4.0 - 0.0) = -1.0
    agent.update(s, RLAction.HOLD_PHASE, -4.0, nextS, true);
    expect(agent.getQValues(s)[0]).toBeCloseTo(-1.0, 4);
  });

  it('3. should select greedy action when epsilon = 0 and explore when epsilon = 1', () => {
    const agent = new QLearningAgent({
      alpha: 0.1,
      gamma: 0.9,
      epsilon: 0.0
    });

    const s = 15;
    // Set Q(s, switch) = 5.0, Q(s, hold) = 1.0
    agent.update(s, RLAction.HOLD_PHASE, 10.0, 0, true);
    agent.update(s, RLAction.REQUEST_SWITCH, 50.0, 0, true);

    // With epsilon = 0, greedy action must be selected every time
    for (let i = 0; i < 20; i++) {
      const { action, isExploration } = agent.selectAction(s);
      expect(action).toBe(RLAction.REQUEST_SWITCH);
      expect(isExploration).toBe(false);
    }

    // Set epsilon = 1.0 (pure exploration)
    agent.setHyperparameters({ epsilon: 1.0 });
    const actions: RLAction[] = [];
    for (let i = 0; i < 50; i++) {
      const { action, isExploration } = agent.selectAction(s);
      expect(isExploration).toBe(true);
      actions.push(action);
    }
    // Should have sampled both actions
    expect(actions.includes(RLAction.HOLD_PHASE)).toBe(true);
    expect(actions.includes(RLAction.REQUEST_SWITCH)).toBe(true);
  });

  it('4. should freeze Q-table updates and enforce greedy policy in evaluation mode', () => {
    const agent = new QLearningAgent({
      alpha: 0.5,
      gamma: 0.9,
      epsilon: 0.8
    });

    agent.setEvaluationMode(true);
    expect(agent.isEvaluation()).toBe(true);

    const s = 40;
    // Selection must be greedy (isExploration: false)
    const { isExploration } = agent.selectAction(s);
    expect(isExploration).toBe(false);

    // Updates must be suppressed in evaluation mode
    agent.update(s, RLAction.HOLD_PHASE, 10.0, 0, false);
    expect(agent.getQValues(s)[0]).toBe(0.0);
  });

  it('5. should reset Q-table independently and track visited states', () => {
    const agent = new QLearningAgent();
    expect(agent.getVisitedStatesCount()).toBe(0);

    agent.update(1, RLAction.HOLD_PHASE, 1.0, 0, true);
    agent.update(2, RLAction.HOLD_PHASE, 1.0, 0, true);
    agent.update(3, RLAction.HOLD_PHASE, 1.0, 0, true);
    expect(agent.getVisitedStatesCount()).toBe(3);

    agent.resetQTable();
    expect(agent.getVisitedStatesCount()).toBe(0);
    expect(agent.getQValues(1)[0]).toBe(0.0);
  });
});
