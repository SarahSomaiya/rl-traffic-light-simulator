# RL Traffic Light Simulator 🚦🚗

A visually engaging, gaming-style 3D traffic intersection simulator with Reinforcement Learning (RL) signal control.

## 🌟 Overview

This project simulates a 4-way urban intersection where:
- Vehicles spawn, navigate lanes, queue, and follow traffic rules safely.
- Traffic signals operate with realistic transitions (Green → Yellow → All-Red clearance).
- A Reinforcement Learning (Tabular Q-Learning) agent learns optimal signal phase switching to reduce waiting time and minimize congestion.
- A fixed-time traffic controller acts as a baseline benchmark.
- An interactive gaming HUD displays real-time telemetry, queue lengths, average wait times, and comparative performance curves.

---

## 🛠️ Technology Stack

- **Graphics & 3D**: [Three.js](https://threejs.org/) (WebGL, PBR materials, shadows, orbit/street cameras)
- **Tooling & Build**: [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Testing**: [Vitest](https://vitest.dev/)
- **UI & HUD**: Modern Vanilla CSS with dark-mode glassmorphism and real-time canvas metrics

---

## 🗺️ Implementation Roadmap

- [x] **Phase 1: Project Setup & Architecture** (Vite + TS scaffolding, Vitest testing harness, baseline types)
- [ ] **Phase 2: 3D Environment & Camera System** (Three.js 4-way intersection, traffic light posts, multi-mode camera)
- [ ] **Phase 3: Vehicle Movement & Traffic Rules** (Safe headway kinematics, stop lines, signal transitions)
- [ ] **Phase 4: Camera Controls & Simulation Controls** (Play/Pause, speed sliders, manual overrides)
- [ ] **Phase 5: RL Environment & Tabular Q-Learning** (Gymnasium-style loop, state discretization, training engine)
- [ ] **Phase 6: Gaming Dashboard & Telemetry** (HUD overlays, live queue meters, comparison charts)
- [ ] **Phase 7: Baseline Evaluation & Documentation** (Fixed-time vs RL comparison, performance benchmarks)
- [ ] **Phase 8: Optional Extensions** (Weather effects, vision module hooks)

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
