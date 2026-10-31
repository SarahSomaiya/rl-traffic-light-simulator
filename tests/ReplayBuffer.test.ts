import { describe, it, expect } from 'vitest';
import { ReplayBuffer } from '../src/rl/ReplayBuffer';
import { RLAction, ReplayTransition } from '../src/types';

describe('ReplayBuffer (Experience Replay)', () => {
  it('1. should store transitions as independent copies without reference mutation', () => {
    const buffer = new ReplayBuffer(100);

    const mutableState = [0.1, 0.2, 0.3];
    const mutableNext = [0.4, 0.5, 0.6];
    const transition: ReplayTransition = {
      state: mutableState,
      action: RLAction.HOLD_PHASE,
      reward: -2.5,
      nextState: mutableNext,
      done: false
    };

    buffer.push(transition);
    expect(buffer.size()).toBe(1);

    // Mutate the original arrays outside the buffer
    mutableState[0] = 999.0;
    mutableNext[0] = 888.0;

    // Buffer sample must retain original values
    const sampled = buffer.sample(1);
    expect(sampled.length).toBe(1);
    expect(sampled[0].state[0]).toBe(0.1);
    expect(sampled[0].nextState[0]).toBe(0.4);
    expect(sampled[0].reward).toBe(-2.5);
  });

  it('2. should enforce circular buffer capacity limit', () => {
    const capacity = 5;
    const buffer = new ReplayBuffer(capacity);

    for (let i = 0; i < 10; i++) {
      buffer.push({
        state: [i],
        action: RLAction.HOLD_PHASE,
        reward: i,
        nextState: [i + 1],
        done: false
      });
    }

    // Size must never exceed capacity
    expect(buffer.size()).toBe(capacity);

    // Oldest items (0-4) should have been overwritten by newest items (5-9)
    const sampled = buffer.sample(5);
    const rewards = sampled.map(s => s.reward);
    expect(rewards.every(r => r >= 5 && r <= 9)).toBe(true);
  });

  it('3. should safely sample from partially filled buffer', () => {
    const buffer = new ReplayBuffer(100);
    buffer.push({
      state: [1, 2],
      action: RLAction.REQUEST_SWITCH,
      reward: 3.0,
      nextState: [2, 3],
      done: true
    });

    // Requesting batch size of 32 from buffer of size 1 returns 1
    const sampled = buffer.sample(32);
    expect(sampled.length).toBe(1);
    expect(sampled[0].action).toBe(RLAction.REQUEST_SWITCH);
    expect(sampled[0].done).toBe(true);
  });

  it('4. should clear all transitions upon reset', () => {
    const buffer = new ReplayBuffer(50);
    for (let i = 0; i < 10; i++) {
      buffer.push({
        state: [i],
        action: RLAction.HOLD_PHASE,
        reward: 0,
        nextState: [i],
        done: false
      });
    }

    expect(buffer.size()).toBe(10);
    buffer.clear();
    expect(buffer.size()).toBe(0);
    expect(buffer.sample(5)).toEqual([]);
  });
});

