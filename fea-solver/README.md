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
│   ├── lib.rs          # Library entry point
│   ├── model.rs        # FEModel - main API
│   ├── math.rs         # Stiffness matrices, transformations
│   ├── error.rs        # Error types
│   ├── results.rs      # Analysis result types
│   ├── analysis/       # Analysis algorithms
│   │   └── mod.rs      # AnalysisType, AnalysisOptions
│   ├── elements/       # Structural elements
│   │   ├── node.rs     # Node (3D point)
│   │   ├── member.rs   # Frame element
│   │   ├── plate.rs    # Rectangular plate
│   │   ├── quad.rs     # General quad shell
│   │   ├── material.rs # Material properties
│   │   ├── section.rs  # Cross-sections
│   │   └── support.rs  # Boundary conditions
│   ├── loads/          # Load types
│   │   ├── node_load.rs
│   │   ├── point_load.rs
│   │   ├── distributed.rs
│   │   ├── plate_load.rs
│   │   ├── load_case.rs
│   │   └── load_combo.rs
│   └── bin/
│       ├── example.rs  # Portal frame demo
│       └── server.rs   # HTTP API server
├── benches/
│   └── solver_bench.rs # Performance benchmarks
├── sample_request.json # Example API request
└── Cargo.toml
```

## Theory

The solver uses the direct stiffness method:

1. **Local Stiffness Matrix**: Each element has a local stiffness matrix based on Euler-Bernoulli beam theory (members) or MITC4 formulation (shells)

2. **Transformation**: Local matrices are transformed to global coordinates using rotation matrices

3. **Assembly**: Global stiffness matrix is assembled from all element contributions

4. **Boundary Conditions**: Support conditions are applied by modifying the stiffness matrix

5. **Solution**: System of equations `[K]{D} = {F}` is solved for displacements

6. **Post-processing**: Member forces, reactions, and stresses are calculated

### P-Delta Analysis

For geometric nonlinearity, the solver iterates:

1. Solve linear system
2. Calculate geometric stiffness from axial forces
3. Add geometric stiffness to elastic stiffness
4. Re-solve until convergence

## License

MIT License

## Acknowledgments

- [PyNite](https://github.com/JWock82/Pynite) - Python FEA library that inspired this implementation
- [nalgebra](https://nalgebra.org/) - Linear algebra library for Rust
