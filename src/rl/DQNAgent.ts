import * as tf from '@tensorflow/tfjs';
import { RLAction, DQNHyperparameters, ReplayTransition } from '../types';
import { DQN_OBSERVATION_DIM } from './TrafficStateEncoder';

export const DEFAULT_DQN_HYPERPARAMETERS: DQNHyperparameters = {
  learningRate: 0.001,
  gamma: 0.95,
  epsilon: 1.0,
  minEpsilon: 0.05,
  epsilonDecay: 0.98,
  decisionIntervalSec: 5.0,
  batchSize: 32,
  replayCapacity: 10000,
  minReplaySize: 32,
  targetSyncInterval: 10,
  hiddenUnits: [64, 64]
};

export interface DQNAgentTelemetry {
  qValues: [number, number]; // [holdQ, switchQ]
  epsilon: number;
  totalDecisions: number;
  trainingSteps: number;
  recentLoss: number;
  targetSyncCount: number;
  isEvaluation: boolean;
}

/**
 * Deep Q-Network (DQN) Agent.
 * Uses a browser-compatible TensorFlow.js Multi-Layer Perceptron (MLP)
 * with Experience Replay, Target Network stabilization, and Epsilon-Greedy exploration.
 */
export class DQNAgent {
  private config: DQNHyperparameters;
  private inputDim: number;
  private actionDim: number = 2; // HOLD_PHASE (0), REQUEST_SWITCH (1)

  private onlineModel!: tf.LayersModel;
  private targetModel!: tf.LayersModel;

  private isEvaluationMode: boolean = false;
  private totalDecisionsCount: number = 0;
  private trainingSteps: number = 0;
  private recentLoss: number = 0;
  private targetSyncCount: number = 0;

  // PRNG state for deterministic exploration
  private seed: number;

  constructor(
    config: Partial<DQNHyperparameters> = {},
    seed: number = 42,
    inputDim: number = DQN_OBSERVATION_DIM
  ) {
    this.config = { ...DEFAULT_DQN_HYPERPARAMETERS, ...config };
    this.seed = seed;
    this.inputDim = inputDim;

    this.initModels();
  }

  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Constructs a 2-hidden layer Multi-Layer Perceptron.
   * Input (15) -> Dense(64, ReLU) -> Dense(64, ReLU) -> Dense(2, Linear)
   */
  private buildNetwork(): tf.LayersModel {
    const model = tf.sequential();

    // First Hidden Layer
    model.add(
      tf.layers.dense({
        inputShape: [this.inputDim],
        units: this.config.hiddenUnits[0] ?? 64,
        activation: 'relu',
        kernelInitializer: 'glorotUniform',
        biasInitializer: 'zeros'
      })
    );

    // Second Hidden Layer
    model.add(
      tf.layers.dense({
        units: this.config.hiddenUnits[1] ?? 64,
        activation: 'relu',
        kernelInitializer: 'glorotUniform',
        biasInitializer: 'zeros'
      })
    );

    // Linear Output Layer (2 Q-values: HOLD_PHASE, REQUEST_SWITCH)
    model.add(
      tf.layers.dense({
        units: this.actionDim,
        activation: 'linear',
        kernelInitializer: 'glorotUniform',
        biasInitializer: 'zeros'
      })
    );

    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError'
    });

    return model;
  }

  private initModels(): void {
    if (this.onlineModel) {
      this.onlineModel.dispose();
    }
    if (this.targetModel) {
      this.targetModel.dispose();
    }

    this.onlineModel = this.buildNetwork();
    this.targetModel = this.buildNetwork();

    this.syncTargetNetwork();
  }

  /**
   * Synchronizes target network weights with online network.
   */
  public syncTargetNetwork(): void {
    const onlineWeights = this.onlineModel.getWeights();
    const clonedWeights = onlineWeights.map(w => w.clone());
    this.targetModel.setWeights(clonedWeights);
    // Dispose cloned weights after assignment
    clonedWeights.forEach(w => w.dispose());
    this.targetSyncCount++;
  }

  public getHyperparameters(): DQNHyperparameters {
    return { ...this.config };
  }

  public setHyperparameters(params: Partial<DQNHyperparameters>): void {
    this.config = { ...this.config, ...params };
  }

  public isEvaluation(): boolean {
    return this.isEvaluationMode;
  }

  public setEvaluationMode(enabled: boolean): void {
    this.isEvaluationMode = enabled;
  }

  public getTrainingSteps(): number {
    return this.trainingSteps;
  }

  public getRecentLoss(): number {
    return parseFloat(this.recentLoss.toFixed(4));
  }

  /**
   * Computes predicted Q-values [Q(HOLD), Q(SWITCH)] for an observation vector.
   * Encapsulated in tf.tidy() to prevent memory leaks.
   */
  public predictQValues(stateVector: number[]): [number, number] {
    return tf.tidy(() => {
      const input = tf.tensor2d([stateVector], [1, this.inputDim]);
      const pred = this.onlineModel.predict(input) as tf.Tensor;
      const data = pred.dataSync();

      const holdQ = Number.isFinite(data[0]) ? data[0] : 0.0;
      const switchQ = Number.isFinite(data[1]) ? data[1] : 0.0;
      return [parseFloat(holdQ.toFixed(4)), parseFloat(switchQ.toFixed(4))];
    });
  }

  /**
   * Selects an action using Epsilon-Greedy policy.
   * If in evaluation mode or random roll >= epsilon: exploits greedy action.
   * Otherwise explores by taking a random action.
   */
  public selectAction(stateVector: number[]): {
    action: RLAction;
    isExploration: boolean;
    qValues: [number, number];
  } {
    const qValues = this.predictQValues(stateVector);
    this.totalDecisionsCount++;

    const effectiveEpsilon = this.isEvaluationMode ? 0.0 : this.config.epsilon;

    if (this.random() < effectiveEpsilon) {
      // Exploration: uniform random choice
      const randomAction = this.random() < 0.5 ? RLAction.HOLD_PHASE : RLAction.REQUEST_SWITCH;
      return {
        action: randomAction,
        isExploration: true,
        qValues
      };
    } else {
      // Exploitation: argmax action. Ties break to HOLD_PHASE to prevent needless switches
      const greedyAction = qValues[1] > qValues[0] ? RLAction.REQUEST_SWITCH : RLAction.HOLD_PHASE;
      return {
        action: greedyAction,
        isExploration: false,
        qValues
      };
    }
  }

  /**
   * Performs one Mini-Batch Deep Q-Learning training step.
   *
   * Target calculation:
   * y_i = r_i                                              (if terminal transition)
   * y_i = r_i + gamma * max_a' Q_target(nextState_i, a')   (if non-terminal transition)
   *
   * Loss = MSE(Q_online(state_i, action_i), y_i)
   *
   * @param batch Array of sampled experiences from ReplayBuffer
   * @returns loss value
   */
  public async trainOnBatch(batch: ReplayTransition[]): Promise<number> {
    if (this.isEvaluationMode || batch.length === 0) return 0.0;

    const states: number[][] = [];
    const nextStates: number[][] = [];
    const actions: number[] = [];
    const rewards: number[] = [];
    const dones: boolean[] = [];

    for (const t of batch) {
      states.push(t.state);
      nextStates.push(t.nextState);
      actions.push(t.action === RLAction.REQUEST_SWITCH ? 1 : 0);
      rewards.push(t.reward);
      dones.push(t.done);
    }

    const batchSize = batch.length;

    // 1. Compute target vectors in tf.tidy
    const { stateTensor, targetTensor } = tf.tidy(() => {
      const sTensor = tf.tensor2d(states, [batchSize, this.inputDim]);
      const nextSTensor = tf.tensor2d(nextStates, [batchSize, this.inputDim]);

      // Online network predictions for current states
      const currentQ = (this.onlineModel.predict(sTensor) as tf.Tensor).arraySync() as number[][];

      // Target network predictions for next states
      const nextQ = (this.targetModel.predict(nextSTensor) as tf.Tensor).arraySync() as number[][];

      // Update the predicted Q-values with target for the taken action
      for (let i = 0; i < batchSize; i++) {
        const actionIdx = actions[i];
        let targetVal = rewards[i];

        if (!dones[i]) {
          const maxNextQ = Math.max(nextQ[i][0], nextQ[i][1]);
          targetVal += this.config.gamma * maxNextQ;
        }

        currentQ[i][actionIdx] = Number.isFinite(targetVal) ? targetVal : currentQ[i][actionIdx];
      }

      return {
        stateTensor: sTensor,
        targetTensor: tf.tensor2d(currentQ, [batchSize, this.actionDim])
      };
    });

    // 2. Perform optimization step outside tf.tidy
    try {
      const history = await this.onlineModel.fit(stateTensor, targetTensor, {
        epochs: 1,
        verbose: 0,
        batchSize
      });

      const loss = (history.history.loss[0] as number) || 0.0;
      this.recentLoss = Number.isFinite(loss) ? loss : 0.0;
      this.trainingSteps++;

      // 3. Periodic Target Network Synchronization
      if (this.trainingSteps % this.config.targetSyncInterval === 0) {
        this.syncTargetNetwork();
      }

      return this.recentLoss;
    } finally {
      stateTensor.dispose();
      targetTensor.dispose();
    }
  }

  /**
   * Decays exploration rate epsilon at the end of each episode.
   */
  public decayEpsilon(): number {
    this.config.epsilon = Math.max(
      this.config.minEpsilon,
      parseFloat((this.config.epsilon * this.config.epsilonDecay).toFixed(4))
    );
    return this.config.epsilon;
  }

  public resetEpsilon(): void {
    this.config.epsilon = DEFAULT_DQN_HYPERPARAMETERS.epsilon;
  }

  /**
   * Resets model weights, optimizer, and training metrics for a fresh run.
   */
  public resetWeights(): void {
    this.initModels();
    this.trainingSteps = 0;
    this.recentLoss = 0;
    this.targetSyncCount = 0;
  }

  public getTelemetry(): DQNAgentTelemetry {
    return {
      qValues: [0, 0],
      epsilon: this.config.epsilon,
      totalDecisions: this.totalDecisionsCount,
      trainingSteps: this.trainingSteps,
      recentLoss: this.recentLoss,
      targetSyncCount: this.targetSyncCount,
      isEvaluation: this.isEvaluationMode
    };
  }

  /**
   * Cleans up TensorFlow.js tensors and models.
   */
  public dispose(): void {
    if (this.onlineModel) {
      this.onlineModel.dispose();
    }
    if (this.targetModel) {
      this.targetModel.dispose();
    }
  }
}

