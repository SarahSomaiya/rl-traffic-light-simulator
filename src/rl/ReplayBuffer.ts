import { ReplayTransition } from '../types';

export interface ReplayBufferOptions {
  capacity?: number;
}

/**
 * Experience Replay Buffer for Deep Q-Network training.
 * Stores transitions (s, a, r, s', done) as independent cloned copies,
 * preventing reference mutations from corrupting historical experience.
 */
export class ReplayBuffer {
  private buffer: ReplayTransition[] = [];
  private capacity: number;
  private writePointer: number = 0;

  // PRNG state for reproducible sampling
  private seed: number;

  constructor(capacity: number = 10000, seed: number = 42) {
    this.capacity = Math.max(1, capacity);
    this.seed = seed;
  }

  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public size(): number {
    return this.buffer.length;
  }

  /**
   * Adds an experience transition to the buffer.
   * Clones state vectors so future simulations cannot mutate the stored experience.
   */
  public push(transition: ReplayTransition): void {
    const cloned: ReplayTransition = {
      state: [...transition.state],
      action: transition.action,
      reward: Number.isFinite(transition.reward) ? transition.reward : 0.0,
      nextState: [...transition.nextState],
      done: Boolean(transition.done)
    };

    if (this.buffer.length < this.capacity) {
      this.buffer.push(cloned);
    } else {
      this.buffer[this.writePointer] = cloned;
      this.writePointer = (this.writePointer + 1) % this.capacity;
    }
  }

  /**
   * Uniformly samples a random mini-batch of experiences.
   * Safe to call on partially filled buffers (samples up to available items).
   */
  public sample(batchSize: number): ReplayTransition[] {
    const count = Math.min(batchSize, this.buffer.length);
    if (count <= 0) return [];

    const sampled: ReplayTransition[] = [];
    const available = [...this.buffer];

    // Fisher-Yates shuffle sampling
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.random() * (available.length - i)) + i;
      const temp = available[i];
      available[i] = available[idx];
      available[idx] = temp;
      sampled.push({
        state: [...available[i].state],
        action: available[i].action,
        reward: available[i].reward,
        nextState: [...available[i].nextState],
        done: available[i].done
      });
    }

    return sampled;
  }

  public clear(): void {
    this.buffer = [];
    this.writePointer = 0;
  }
}
