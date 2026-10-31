# RL Traffic Light Simulator 🚦🚗

A visually engaging, gaming-style 3D traffic intersection simulator with Reinforcement Learning (RL) signal control.

## 🌟 Overview

This project simulates a 4-way urban intersection where:
- Vehicles spawn, navigate lanes, queue, and follow traffic rules safely.
- Traffic signals operate with realistic transitions (Green → Yellow → All-Red clearance).
- A Reinforcement Learning (Deep Q-Network with TensorFlow.js) agent learns optimal signal phase switching from rich continuous traffic observations to reduce waiting time and minimize congestion.
- An Experience Replay buffer (10,000 transitions) and periodic Target Network synchronization stabilize neural network training.
- A fixed-time traffic controller acts as a baseline benchmark.
- An interactive gaming HUD displays real-time telemetry, queue lengths, average wait times, training loss, and live reward performance curves.

---

## 🛠️ Technology Stack

- **Machine Learning**: [TensorFlow.js](https://js.tensorflow.org/) (Multi-Layer Perceptron, Adam Optimizer, Experience Replay, Target Network)
- **Graphics & 3D**: [Three.js](https://threejs.org/) (WebGL, PBR materials, shadows, orbit/street cameras)
- **Tooling & Build**: [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Testing**: [Vitest](https://vitest.dev/)
- **UI & HUD**: Modern Vanilla CSS with dark-mode glassmorphism and real-time canvas metrics

---

## 🧠 Deep Q-Network Architecture

- **State Representation (15 Continuous/One-Hot Features)**:
  - Green direction one-hot (`[NS, EW]`)
  - Normalized queues by approach (`NS_queue/20`, `EW_queue/20`)
  - Normalized average waiting times (`NS_wait/60s`, `EW_wait/60s`)
  - Normalized approach speeds (`NS_speed/15m/s`, `EW_speed/15m/s`)
  - Normalized traffic densities (`NS_density/20`, `EW_density/20`)
  - Active emergency vehicle flag, approach direction one-hot (`[em_NS, em_EW]`), and normalized stop-line distance
  - Elapsed green phase time (`phase_elapsed/30s`)
- **Neural Network Architecture**:
  - Input Layer: 15 units
  - Dense Hidden 1: 64 units (ReLU activation, Glorot Uniform initializer)
  - Dense Hidden 2: 64 units (ReLU activation, Glorot Uniform initializer)
  - Output Layer: 2 linear units (`Q(HOLD_PHASE)`, `Q(REQUEST_SWITCH)`)
  - Optimizer: Adam (`lr = 0.001`), Loss: Mean Squared Error (MSE)
- **Training Stability**:
  - Replay Buffer Capacity: 10,000 transitions
  - Mini-batch Size: 32 transitions
  - Target Network Sync: Every 10 training updates
  - Epsilon Schedule: $\epsilon_0 = 1.00 \to \epsilon_{\min} = 0.05$ with $0.98$ decay per episode
- **Signal Safety Gate**:
  - Authoritative `SignalController` guarantees zero conflicting greens, mandatory 4.0s minimum green, 3.0s yellow clearance, and 1.5s all-red buffer.

---

## 🗺️ Implementation Roadmap

- [x] **Phase 1: Project Setup & Architecture** (Vite + TS scaffolding, Vitest testing harness, baseline types)
- [x] **Phase 2: 3D Environment & Camera System** (Three.js 4-way intersection, traffic light posts, multi-mode camera)
- [x] **Phase 3: Vehicle Movement & Traffic Rules** (Safe headway kinematics, stop lines, signal transitions)
- [x] **Phase 3.5: Fleet Diversity, Speed Enforcement & Emergency Response** (7 vehicle classes, speed cameras, sirens)
- [x] **Phase 4: Deep Q-Network (DQN) Upgrade** (TensorFlow.js MLP, 15-dim continuous state, Replay Buffer, Target Network, Live Canvas Charts, Head-to-Head Benchmark)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended, v22 LTS tested)
- npm (v10+)

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### Run Tests
```bash
npm test
```

### Production Build
```bash
npm run build
```

---

## 📄 License
MIT
