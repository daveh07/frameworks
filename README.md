# Frameworkz - Structural Analysis Platform

A modern web-based structural engineering application featuring real-time 3D visualization and finite element analysis powered by CalculiX.

##  Overview

Frameworkz is a comprehensive structural analysis platform that combines:
- **Interactive 3D Modeling**: Web-based interface built with Dioxus and Three.js
- **Finite Element Analysis**: Powered by CalculiX, a proven open-source FEA solver
- **Real-time Visualization**: Instant feedback with deformed shapes, stress contours, and force diagrams
- **Cross-platform**: Runs in any modern web browser

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
│  CalculiX Service (Rust + Axum)                 │
│  - REST API endpoints                           │
│  - INP file generation                          │
│  - CalculiX integration                         │
│  - DAT/FRD result parsing                       │
│  Port: 8084                                     │
└──────────────────┬──────────────────────────────┘
                   │
                   │ Process execution
                   │
┌──────────────────▼──────────────────────────────┐
│  CalculiX Solver (ccx)                          │
│  - Finite element analysis                      │
│  - Supports beams, shells, solids               │
│  - Linear & nonlinear analysis                  │
└─────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
frameworkz/
├── README.md                    # This file
├── quickstart.sh               # Quick start script (Linux/macOS)
│
├── frameworkz/                  # Frontend application
│   ├── src/
│   │   ├── main.rs             # Application entry point
│   │   ├── components/         # UI components
│   │   │   ├── layout/         # Layout components (panels, toolbar)
│   │   │   ├── navigation/     # Navigation components
│   │   │   └── visualization/  # Three.js 3D viewport & JS bindings
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom hooks
│   │   ├── types.rs            # Shared types
│   │   └── calculix_client.rs  # HTTP client for backend
│   ├── assets/                 # CSS, Three.js
│   ├── Cargo.toml
│   └── Dioxus.toml             # Dioxus configuration
│
├── calculix-service/           # CalculiX Backend service
    ├── src/
    │   ├── main.rs             # Service entry point
    │   ├── api.rs              # REST API endpoints
    │   ├── executor.rs         # CalculiX runner & result parser
    │   ├── generator.rs        # INP file generator
    │   └── models.rs           # Request/response types
    ├── bin/                    # CalculiX executable (ccx)
    ├── Cargo.toml
    └── debug_export/           # Generated INP files for debugging

```

---

##  Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Rust | 1.75+ | Backend & WASM frontend |
| Dioxus CLI | 0.6.x | Frontend build tool |
| CalculiX (ccx) | 2.23+ | FEA solver |

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

### 4. Install CalculiX

#### Option A: Package Manager (Recommended)

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install calculix-ccx
```

**Fedora/RHEL:**
```bash
sudo dnf install calculix
```

**Arch Linux:**
```bash
sudo pacman -S calculix
```

Verify:
```bash
ccx --version  # or ccx_2.23 --version
```

#### Option B: Build from Source

```bash
# Install dependencies
sudo apt install build-essential gfortran liblapack-dev libblas-dev libarpack2-dev

# Download CalculiX
wget http://www.dhondt.de/ccx_2.23.src.tar.bz2
tar -xjf ccx_2.23.src.tar.bz2

# You also need SPOOLES and ARPACK libraries
# See CalculiX documentation for detailed build instructions
cd CalculiX/ccx_2.23/src
make
```

#### Option C: Use Pre-built Binary

The project includes a pre-built Linux `ccx` binary:
```bash
chmod +x calculix-service/bin/ccx
./calculix-service/bin/ccx --version
```

### 5. Optional: Fast Linker (speeds up builds)

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

### 4. Install CalculiX

#### Option A: Homebrew (Recommended)
```bash
brew install calculix
```

Verify:
```bash
ccx --version
```

#### Option B: Build from Source
```bash
# Install dependencies
brew install gcc gfortran lapack arpack

# Download and build
wget http://www.dhondt.de/ccx_2.23.src.tar.bz2
tar -xjf ccx_2.23.src.tar.bz2
cd CalculiX/ccx_2.23/src
make
```

Copy the built binary:
```bash
cp ccx /path/to/frameworkz/calculix-service/bin/
chmod +x /path/to/frameworkz/calculix-service/bin/ccx
```

If macOS blocks the binary:
```bash
xattr -d com.apple.quarantine calculix-service/bin/ccx
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

### 5. Install CalculiX

#### Option A: Pre-built Windows Binary (Recommended)
1. Download from http://www.bconverged.com/calculix.php
2. Extract to a folder (e.g., `C:\CalculiX`)
3. Add to PATH or note the path for later

#### Option B: WSL2 (Best Experience)
For the most reliable experience on Windows, use WSL2:

```powershell
# Install WSL2
wsl --install

# Inside WSL, follow Linux instructions above
```

---

##  Running the Application

### Quick Start (Linux/macOS)

```bash
chmod +x quickstart.sh
./quickstart.sh
```

### Manual Start

#### 1. Start CalculiX Service (Terminal 1)

**First time only:** Build the service
```bash
cd calculix-service
cargo build --release
```

**To run the service:**
```bash
cd calculix-service

# Linux/macOS (recommended - with cleanup):
pkill -f "calculix-service" || true; sleep 1; \
cd /path/to/frameworkz/calculix-service && \
CALCULIX_PATH=/path/to/frameworkz/calculix-service/bin/ccx \
./target/release/calculix-service

# Linux (simple - using included binary):
CALCULIX_PATH=./bin/ccx ./target/release/calculix-service

# Linux (system installed):
CALCULIX_PATH=/usr/bin/ccx ./target/release/calculix-service

# macOS (Homebrew):
CALCULIX_PATH=$(brew --prefix)/bin/ccx ./target/release/calculix-service

# Windows (PowerShell):
$env:CALCULIX_PATH="C:\CalculiX\bin\ccx.exe"
.\target\release\calculix-service.exe

# Windows (CMD):
set CALCULIX_PATH=C:\CalculiX\bin\ccx.exe
.\target\release\calculix-service.exe
```

> **Note:** Replace `/path/to/frameworkz` with your actual project path. The `pkill` command ensures no stale processes are running.

Service starts on **http://localhost:8084**

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
cd frameworkz
dx build --release
```

Output: `frameworkz/dist/`

### Backend

```bash
cd calculix-service
cargo build --release
```

Output: `calculix-service/target/release/calculix-service`

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
curl -X POST http://localhost:8084/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "model": {
      "nodes": [
        {"id": 0, "x": 0.0, "y": 0.0, "z": 0.0},
        {"id": 1, "x": 8.0, "y": 0.0, "z": 0.0}
      ],
      "beams": [{
        "id": 0,
        "node_ids": [0, 1],
        "section": {
          "width": 0.149,
          "height": 0.298,
          "section_type": "IBeam",
          "flange_thickness": 0.008,
          "web_thickness": 0.0055
        }
      }],
      "shells": [],
      "supports": [
        {"node_id": 0, "constraint_type": "Pinned"},
        {"node_id": 1, "constraint_type": "Pinned"}
      ],
      "point_loads": [],
      "distributed_loads": [{
        "element_ids": [0],
        "load_type": {"Uniform": {"value": -10.0, "direction": "Y"}}
      }],
      "pressure_loads": [],
      "material": {
        "name": "Steel",
        "elastic_modulus": 210e9,
        "poisson_ratio": 0.3,
        "density": 7850.0
      }
    }
  }'
```

---

##  Troubleshooting

### CalculiX not found

```
Error: CalculiX executable not found
```

**Solution:** Set the `CALCULIX_PATH` environment variable:
```bash
export CALCULIX_PATH=/path/to/ccx
```

### Permission denied (Linux)

```bash
chmod +x calculix-service/bin/ccx
```

### macOS security block

```bash
xattr -d com.apple.quarantine calculix-service/bin/ccx
```

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
Error: Address already in use (8084)
```

**Solution:**
```bash
# Find process
lsof -i :8084          # Linux/macOS
netstat -ano | findstr :8084  # Windows

# Kill it
kill -9 <PID>          # Linux/macOS
taskkill /PID <PID> /F # Windows
```

### Analysis returns zeros

Check:
1. Supports are properly applied (at least 2 pinned or 1 fixed)
2. Loads are in correct direction (Y = vertical)
3. Beam section properties are valid

Debug by checking generated INP file in `calculix-service/debug_export/`

---

##  Resources

- [CalculiX Documentation](http://www.dhondt.de/ccx_2.21.pdf)
- [CalculiX Examples](http://www.dhondt.de/ccx_2.21.test.tar.bz2)
- [Dioxus Documentation](https://dioxuslabs.com/learn/0.6/)
- [Three.js Documentation](https://threejs.org/docs/)
- [Rust Book](https://doc.rust-lang.org/book/)

---

##  Features

- ✅ Interactive 3D structural modeling
- ✅ Beam elements (B31, B32) with I-beam sections
- ✅ Shell/plate elements (S4, S8)
- ✅ Point loads, distributed loads, pressure loads
- ✅ Multiple support types (fixed, pinned, roller)
- ✅ Linear static analysis
- ✅ Stress contour visualization
- ✅ Deformed shape display
- ✅ Bending moment diagrams
- 🚧 Modal analysis (planned)
- 🚧 Buckling analysis (planned)

---

## 📄 License

[Add license here]

---

##  Acknowledgments

- [CalculiX](http://www.calculix.de/) - Open source FEA solver by Guido Dhondt
- [Dioxus](https://dioxuslabs.com/) - Rust UI framework
- [Three.js](https://threejs.org/) - 3D visualization library
- [Axum](https://github.com/tokio-rs/axum) - Rust web framework

---
