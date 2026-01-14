# FEA Solver

A native Rust finite element analysis (FEA) library inspired by [PyNite](https://github.com/JWock82/Pynite). Provides structural analysis capabilities for frames, beams, and shell elements with support for linear static and P-Delta (second-order) analysis.

## Features

- **Frame Elements**: 3D beam/column members with 6 DOF per node (12 DOF total)
- **Shell Elements**: Quadrilateral plate/shell elements (MITC4 formulation, 24 DOF)
- **Analysis Types**:
  - Linear static analysis
  - P-Delta (geometric nonlinear) analysis
  - Modal analysis (eigenvalue) - planned
- **Load Types**:
  - Nodal forces and moments
  - Distributed loads (uniform, triangular)
  - Point loads on members
  - Surface pressure on plates
- **Load Combinations**: LRFD and ASD presets with custom combinations
- **Material Library**: Steel, concrete, aluminum presets
- **Section Library**: Rectangular, circular, pipe, wide flange, box sections
- **WebAssembly Support**: Optional WASM target for browser-based analysis

## Examples

### 3D Frame Analysis with Deflection Visualization
<img width="1914" height="930" alt="3D Frame Model" src="https://github.com/user-attachments/assets/787277d5-170f-4abe-bdcd-0acf93c7c113" />

### Stress Contour Results
<img width="1910" height="962" alt="Stress Results" src="https://github.com/user-attachments/assets/ee167aaa-c647-4485-a806-ba153fdb1285" />

### Portal Frame Deformation
<img width="1910" height="962" alt="Frame Deflection" src="https://github.com/user-attachments/assets/461b591e-e887-4e3c-b5a8-f05817d7b48f" />

### Multi-Story Frame Analysis
<img width="1910" height="962" alt="Multi-Story Analysis" src="https://github.com/user-attachments/assets/264e3d5a-eb05-400d-a05d-2e3b18dcd6fc" />

## Quick Start

```rust
use fea_solver::prelude::*;

fn main() -> FEAResult<()> {
    // Create a new model
    let mut model = FEModel::new();
    
    // Add materials and sections
    model.add_material("Steel", Material::steel())?;
    model.add_section("W14x30", Section::wide_flange(0.0057, 2.91e-4, 1.42e-5, 7.4e-7))?;
    
    // Add nodes
    model.add_node("N1", Node::new(0.0, 0.0, 0.0))?;
    model.add_node("N2", Node::new(0.0, 4.0, 0.0))?;
    model.add_node("N3", Node::new(6.0, 4.0, 0.0))?;
    model.add_node("N4", Node::new(6.0, 0.0, 0.0))?;
    
    // Add members
    model.add_member("Col1", Member::new("N1", "N2", "Steel", "W14x30"))?;
    model.add_member("Col2", Member::new("N4", "N3", "Steel", "W14x30"))?;
    model.add_member("Beam", Member::new("N2", "N3", "Steel", "W14x30"))?;
    
    // Add supports
    model.add_support("N1", Support::fixed())?;
    model.add_support("N4", Support::fixed())?;
    
    // Add loads
    model.add_node_load("N2", NodeLoad::fx(10000.0, "Lateral"))?;
    model.add_distributed_load("Beam", DistributedLoad::uniform_fy(-20000.0, "Dead"))?;
    
    // Add load combinations
    model.add_load_combo(LoadCombination::new("1.4D").add_case("Dead", 1.4))?;
    model.add_load_combo(LoadCombination::new("1.2D+1.0L")
        .add_case("Dead", 1.2)
        .add_case("Lateral", 1.0))?;
    
    // Run analysis
    model.analyze_linear()?;
    
    // Get results
    if let Some(disp) = model.node_displacement("N2", "1.4D") {
        println!("Node N2 displacements: dx={:.6} m, dy={:.6} m", disp.dx, disp.dy);
    }
    
    // Print summary
    println!("{}", model.summary());
    
    Ok(())
}
```

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
fea-solver = { path = "../fea-solver" }
```

## Running the Examples

### Portal Frame Example

```bash
cd fea-solver
cargo run --bin fea-example
```

### HTTP Server

Start the analysis server on port 8086:

```bash
cargo run --bin fea-server
```

Then send analysis requests:

```bash
curl -X POST http://localhost:8086/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d @sample_request.json
```

## API Reference

### Core Types

| Type | Description |
|------|-------------|
| `FEModel` | Main model container and analysis driver |
| `Node` | 3D point with 6 DOF (dx, dy, dz, rx, ry, rz) |
| `Member` | Frame element connecting two nodes |
| `Plate` | Rectangular shell element (4 nodes) |
| `Quad` | General quadrilateral shell element |
| `Material` | Elastic material properties |
| `Section` | Cross-section properties |
| `Support` | Boundary conditions |

### Load Types

| Type | Description |
|------|-------------|
| `NodeLoad` | Direct nodal forces/moments |
| `PointLoad` | Concentrated load on a member |
| `DistributedLoad` | Line load along a member |
| `PlateLoad` | Surface pressure on plates |
| `LoadCase` | Named group of loads |
| `LoadCombination` | Factored combination of load cases |

### Analysis Methods

```rust
// Linear elastic analysis
model.analyze_linear()?;

// P-Delta (second-order) analysis
model.analyze_p_delta()?;

// With custom options
let options = AnalysisOptions {
    analysis_type: AnalysisType::PDelta,
    max_iterations: 30,
    tolerance: 1e-6,
    sparse_threshold: 500,
};
model.analyze_with_options(options)?;
```

### Result Access

```rust
// Node displacements
let disp = model.node_displacement("N2", "1.4D");

// Support reactions
let reactions = model.node_reactions("N1", "1.4D");

// Member end forces
let forces_i = model.member_forces_i("Beam", "1.4D");
let forces_j = model.member_forces_j("Beam", "1.4D");

// Analysis summary
let summary = model.summary();
```

## WebAssembly Build

Build for WASM target:

```bash
cargo build --lib --target wasm32-unknown-unknown --features wasm --no-default-features
```

Or use `wasm-pack`:

```bash
wasm-pack build --target web --features wasm --no-default-features
```

## Architecture

```
fea-solver/
├── src/
│   ├── lib.rs              # Library entry point & prelude exports
│   ├── model.rs            # FEModel - main API container (~1500 LOC)
│   ├── error.rs            # Custom error types (FEAError, FEAResult)
│   ├── results.rs          # Result types (displacements, forces, stresses)
│   │
│   ├── analysis/           # Analysis algorithms
│   │   └── mod.rs          # AnalysisType, AnalysisOptions
│   │
│   ├── elements/           # Structural elements
│   │   ├── mod.rs          # Element exports
│   │   ├── node.rs         # Node (3D point with 6 DOF)
│   │   ├── member.rs       # Frame element (12 DOF, Euler-Bernoulli beam)
│   │   ├── plate.rs        # Rectangular plate element
│   │   ├── quad.rs         # General quadrilateral shell (MITC4, 24 DOF)
│   │   ├── material.rs     # Material properties (E, G, ν, ρ)
│   │   ├── section.rs      # Cross-sections (A, Iy, Iz, J)
│   │   └── support.rs      # Boundary conditions
│   │
│   ├── loads/              # Load types
│   │   ├── mod.rs          # Load exports
│   │   ├── node_load.rs    # Nodal forces/moments
│   │   ├── point_load.rs   # Concentrated member loads
│   │   ├── distributed.rs  # Uniform/triangular distributed loads
│   │   ├── plate_load.rs   # Surface pressure on plates
│   │   ├── load_case.rs    # Named load groupings
│   │   └── load_combo.rs   # Factored load combinations
│   │
│   ├── math/               # Numerical core
│   │   ├── mod.rs          # Stiffness matrices, transformations
│   │   ├── plate.rs        # Plate/shell formulations (MITC4)
│   │   └── sparse.rs       # Sparse matrix builder & solvers
│   │
│   └── bin/                # Executables
│       ├── example.rs      # Portal frame demonstration
│       ├── server.rs       # HTTP API server (port 8086)
│       ├── debug_cantilever.rs
│       └── test_matrix.rs
│
├── benches/                # Performance benchmarks
├── tests/                  # Integration tests
├── sample_request.json     # Example HTTP API request
└── Cargo.toml
```

## Core Components

### FEModel (`model.rs`)

The central structural model container managing:
- **Entities**: Nodes, members, plates, quads, materials, sections, supports
- **Loads**: Node loads, point loads, distributed loads, plate pressures
- **Combinations**: Load cases and factored combinations
- **Analysis**: Linear, P-Delta, and modal analysis drivers
- **Results**: Displacement, force, and stress extraction

### Numerical Core (`math/`)

| Module | Description |
|--------|-------------|
| `mod.rs` | Member stiffness matrices (12×12), transformation matrices, direction cosines |
| `plate.rs` | MITC4 shell formulation (24×24), plate transformations, stress recovery |
| `sparse.rs` | COO→CSR matrix builder, Cholesky/LU solvers via `nalgebra_sparse` |

**Matrix Types:**
- `Mat12` / `Vec12` - Member stiffness and force vectors
- `Mat24` / `Vec24` - Plate/shell stiffness and force vectors
- `Mat` / `Vec` - Dynamic global system matrices

### Element Formulations

| Element | DOF | Theory |
|---------|-----|--------|
| `Member` | 12 (6 per node) | Euler-Bernoulli beam with axial-flexural coupling |
| `Plate` | 24 (6 per node) | Rectangular Mindlin-Reissner plate |
| `Quad` | 24 (6 per node) | MITC4 shell (membrane + bending + drilling) |

### Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                        FEModel.analyze()                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Validation        Check connectivity, materials, supports    │
│  2. DOF Numbering     Assign global DOF indices to nodes         │
│  3. Assembly          Build global [K] from element matrices     │
│  4. Load Vectors      Compute {F} for each load combination      │
│  5. Boundary Apply    Partition or modify [K] for supports       │
│  6. Solve             [K]{D} = {F} via sparse Cholesky           │
│  7. Back-substitute   Extract nodal displacements                │
│  8. Post-process      Calculate reactions, member forces, stress │
└─────────────────────────────────────────────────────────────────┘
```

## Theory

### Direct Stiffness Method

1. **Local Stiffness Matrix**: Each element contributes a local stiffness matrix:
   - **Members**: 12×12 matrix from Euler-Bernoulli beam theory with shear deformation
   - **Shells**: 24×24 matrix from MITC4 (Mixed Interpolation of Tensorial Components)

2. **Coordinate Transformation**: Local matrices transformed to global coordinates:
   ```
   [K_global] = [T]ᵀ [K_local] [T]
   ```
   Where `[T]` is built from direction cosines following PyNite conventions

3. **Assembly**: Global stiffness matrix assembled using sparse COO format for efficiency (typically 95-99% sparsity)

4. **Boundary Conditions**: Support conditions applied by partitioning or row/column elimination

5. **Solution**: System `[K]{D} = {F}` solved using sparse Cholesky decomposition

6. **Post-processing**: 
   - Member end forces recovered in local coordinates
   - Support reactions from equilibrium
   - Plate stresses at Gauss points

### P-Delta Analysis

Second-order geometric nonlinear analysis using iterative approach:

```
for iteration in 1..max_iterations:
    1. Solve [K_e]{D} = {F}
    2. Compute axial forces P from displacements
    3. Build geometric stiffness [K_g] from P
    4. Update: [K] = [K_e] + [K_g]
    5. Re-solve until ‖ΔD‖ < tolerance
```

### Sparse Matrix Strategy

The solver uses a two-phase approach:
1. **Assembly**: COO (Coordinate) format for O(1) insertion
2. **Solve**: Convert to CSR for cache-efficient sparse Cholesky

## Dependencies

| Crate | Purpose |
|-------|---------|
| `nalgebra` | Dense linear algebra, fixed-size matrices |
| `nalgebra-sparse` | Sparse matrix storage and operations |
| `serde` | Serialization for API requests/responses |
| `tokio` + `axum` | Async HTTP server (bin/server.rs) |

## License

MIT License

## Acknowledgments

- [PyNite](https://github.com/JWock82/Pynite) - Python FEA library that inspired this implementation
- [nalgebra](https://nalgebra.org/) - Linear algebra library for Rust
- MITC4 formulation based on Bathe & Dvorkin (1986)
