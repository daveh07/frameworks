# Frameworks - Structural Analysis Platform

A modern web-based structural engineering application featuring real-time 3D visualization and native Rust finite element analysis.

##  Overview

Frameworkz is a comprehensive structural analysis platform that combines:
- **Interactive 3D Modeling**: Web-based interface built with Dioxus and Three.js
- **Native Rust FEA Solver**: High-performance finite element analysis written entirely in Rust
- **Real-time Visualization**: Instant feedback with deformed shapes, stress contours, and force diagrams
- **Cross-platform**: Runs in any modern web browser

### Examples:
<img width="1914" height="930" alt="image" src="https://github.com/user-attachments/assets/787277d5-170f-4abe-bdcd-0acf93c7c113" />
<img width="1910" height="962" alt="image" src="https://github.com/user-attachments/assets/ee167aaa-c647-4485-a806-ba153fdb1285" />
<img width="1910" height="962" alt="image" src="https://github.com/user-attachments/assets/461b591e-e887-4e3c-b5a8-f05817d7b48f" />
<img width="1910" height="962" alt="image" src="https://github.com/user-attachments/assets/264e3d5a-eb05-400d-a05d-2e3b18dcd6fc" />



##  Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (Dioxus WASM)                         │
│  - Interactive 3D viewport (Three.js)           │
│  - Structural modeling UI                       │
│  - Results visualization                        │
│  Port: 8080                                     │
└──────────────────┬──────────────────────────────┘
                   │
                   │ HTTP/JSON
                   │
┌──────────────────▼──────────────────────────────┐
│  FEA Solver Service (Rust + Axum)               │
│  - REST API endpoints                           │
│  - Native Rust FEA solver                       │
│  - Frame & shell element analysis               │
│  - Linear static & P-Delta analysis             │
│  Port: 8086                                     │
└─────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
frameworkz/
├── README.md                    # This file
│
├── frameworks/                  # Frontend application
│   ├── src/
│   │   ├── main.rs             # Application entry point
│   │   ├── components/         # UI components
│   │   │   ├── layout/         # Layout components (panels, toolbar)
│   │   │   ├── navigation/     # Navigation components
│   │   │   └── visualization/  # Three.js 3D viewport & JS bindings
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom hooks
│   │   ├── types.rs            # Shared types
│   │   └── fea_client.rs       # HTTP client for FEA service
│   ├── assets/                 # CSS, Three.js, JS integrations
│   ├── Cargo.toml
│   └── Dioxus.toml             # Dioxus configuration
│
├── fea-solver/                  # Native Rust FEA solver
│   ├── src/
│   │   ├── lib.rs              # Library entry point
│   │   ├── model.rs            # FE model definition
│   │   ├── analysis/           # Analysis algorithms
│   │   ├── elements/           # Frame & shell elements
│   │   ├── loads/              # Load types
│   │   ├── math/               # Matrix operations
│   │   └── bin/server.rs       # HTTP service
│   ├── Cargo.toml
│   └── README.md               # Solver documentation

```

---

##  Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Rust | 1.75+ | Backend & WASM frontend |
| Dioxus CLI | 0.6.x | Frontend build tool |


---

##  Linux Installation

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

Verify:
```bash
rustc --version  # Should show 1.75+
cargo --version
```

### 2. Install Dioxus CLI

```bash
cargo install dioxus-cli
```

Verify:
```bash
dx --version
```

### 3. Add WASM Target

```bash
rustup target add wasm32-unknown-unknown
```

### 4. Optional: Fast Linker (speeds up builds)

```bash
sudo apt install mold
```

---

##  macOS Installation

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 2. Install Dioxus CLI

```bash
cargo install dioxus-cli
```

### 3. Add WASM Target

```bash
rustup target add wasm32-unknown-unknown
```

---

## Windows Installation

### 1. Install Rust

**Option A: Official Installer**
Download from https://www.rust-lang.org/tools/install

**Option B: Winget**
```powershell
winget install Rustlang.Rust.MSVC
```

Restart terminal, then verify:
```powershell
rustc --version
cargo --version
```

### 2. Install Visual Studio Build Tools

Required for native compilation:
1. Download from https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Install with **"Desktop development with C++"** workload

### 3. Install Dioxus CLI

```powershell
cargo install dioxus-cli
```

### 4. Add WASM Target

```powershell
rustup target add wasm32-unknown-unknown
```

---

##  Running the Application

### Manual Start

#### 1. Start FEA Solver Service (Terminal 1)

**First time only:** Build the service
```bash
cd fea-solver
cargo build --release
```

**To run the service:**
```bash
cd fea-solver

# Linux/macOS:
cargo run --release --bin server

# Or run the built binary directly:
./target/release/server

# Windows:
cargo run --release --bin server
```

Service starts on **http://localhost:8086**

#### 2. Start Frontend (Terminal 2)

**First time only:** Ensure WASM target is installed
```bash
rustup target add wasm32-unknown-unknown
```

**To run the frontend:**
```bash
cd frameworks
dx serve
```

Opens at **http://localhost:8080** (or port shown in terminal)
for main modelling page, go to: http://127.0.0.1:8080/dashboard

---

## Building for Production

### Frontend

```bash
cd frameworks
dx build --release
```

Output: `frameworks/dist/`

### Backend

```bash
cd fea-solver
cargo build --release
```

Output: `fea-solver/target/release/server`

---

##  API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/version` | GET | Service version |
| `/api/v1/analyze` | POST | Run FEA analysis |
| `/api/v1/validate` | POST | Validate model |

### Example Request

```bash
curl -X POST http://localhost:8086/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "model": {
      "nodes": [
        {"name": "N1", "x": 0.0, "y": 0.0, "z": 0.0},
        {"name": "N2", "x": 8.0, "y": 0.0, "z": 0.0}
      ],
      "materials": [{
        "name": "Steel",
        "e": 210e9,
        "g": 80.77e9,
        "nu": 0.3,
        "rho": 7850.0
      }],
      "sections": [{
        "name": "W14x30",
        "a": 0.0057,
        "iy": 2.91e-4,
        "iz": 1.42e-5,
        "j": 7.4e-7
      }],
      "members": [{
        "name": "M1",
        "i_node": "N1",
        "j_node": "N2",
        "material": "Steel",
        "section": "W14x30"
      }],
      "supports": [
        {"node": "N1", "dx": true, "dy": true, "dz": true, "rx": true, "ry": true, "rz": true},
        {"node": "N2", "dx": false, "dy": true, "dz": true, "rx": false, "ry": false, "rz": false}
      ],
      "distributed_loads": [{
        "member": "M1",
        "w1": -20000.0,
        "w2": -20000.0,
        "direction": "Y",
        "case": "Dead"
      }],
      "load_combos": [{
        "name": "1.4D",
        "factors": {"Dead": 1.4}
      }]
    }
  }'
```

---

##  Troubleshooting

### WASM target missing

```
error: wasm32-unknown-unknown target not installed
```

**Solution:**
```bash
rustup target add wasm32-unknown-unknown
```

### Port in use

```
Error: Address already in use (8086)
```

**Solution:**
```bash
# Find process
lsof -i :8086          # Linux/macOS
netstat -ano | findstr :8086  # Windows

# Kill it
kill -9 <PID>          # Linux/macOS
taskkill /PID <PID> /F # Windows
```

### Analysis returns zeros

Check:
1. Supports are properly applied (at least 2 pinned or 1 fixed)
2. Loads are in correct direction (Y = vertical)
3. Section properties are valid

---

##  Resources

- [Dioxus Documentation](https://dioxuslabs.com/learn/0.6/)
- [Three.js Documentation](https://threejs.org/docs/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [PyNite](https://github.com/JWock82/Pynite) - FEA solver inspiration

---

##  Features

- ✅ Interactive 3D structural modeling
- ✅ Frame elements (3D beam/column with 6 DOF per node)
- ✅ Shell/plate elements (MITC4 formulation)
- ✅ Point loads, distributed loads, pressure loads
- ✅ Multiple support types (fixed, pinned, roller)
- ✅ Linear static analysis
- ✅ P-Delta (second-order) analysis
- ✅ Stress contour visualization
- ✅ Deformed shape display
- ✅ Bending moment diagrams
- 🚧 Modal analysis (planned)
- 🚧 Buckling analysis (planned)

---

## 📄 License

Proprietary License

Copyright © 2025 frameworks cloud FEA. All Rights Reserved.

This software and associated documentation files are proprietary. 
No part may be reproduced, distributed, or transmitted in any form 
without prior written permission from the copyright holder.

---

##  Acknowledgments

- [PyNite](https://github.com/JWock82/Pynite) - FEA algorithm inspiration
- [Dioxus](https://dioxuslabs.com/) - Rust UI framework
- [Three.js](https://threejs.org/) - 3D visualization library
- [Axum](https://github.com/tokio-rs/axum) - Rust web framework

---
