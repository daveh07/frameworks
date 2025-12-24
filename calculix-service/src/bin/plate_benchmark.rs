#![allow(dead_code)]

#[path = "../executor.rs"]
mod executor;
#[path = "../generator.rs"]
mod generator;
#[path = "../models.rs"]
mod models;

use executor::CalculiXExecutor;
use generator::CalculiXGenerator;
use models::{Material, Node, PressureLoad, Shell, StructuralModel, Support, SupportType};

fn build_plate_model() -> StructuralModel {
    let span_x = 8.0;
    let span_z = 5.0;
    let spacing = 0.5;
    let thickness = 0.2;

    let nx = (span_x / spacing) as usize;
    let nz = (span_z / spacing) as usize;

    let mut nodes = Vec::new();
    let mut id = 0;
    for iz in 0..=nz {
        for ix in 0..=nx {
            nodes.push(Node {
                id,
                x: ix as f64 * spacing,
                y: 0.0,
                z: iz as f64 * spacing,
            });
            id += 1;
        }
    }

    let nodes_per_row = nx + 1;
    let mut shells = Vec::new();
    let mut shell_id = 0;
    for iz in 0..nz {
        for ix in 0..nx {
            let n0 = iz * nodes_per_row + ix;
            let n1 = n0 + 1;
            let n2 = n1 + nodes_per_row;
            let n3 = n0 + nodes_per_row;
            shells.push(Shell {
                id: shell_id,
                node_ids: vec![n0, n1, n2, n3],
                thickness,
                is_quadratic: false,
            });
            shell_id += 1;
        }
    }

    let supports = vec![
        Support { node_id: 0, constraint_type: SupportType::Pinned },
        Support { node_id: nx, constraint_type: SupportType::Pinned },
        Support { node_id: nz * nodes_per_row, constraint_type: SupportType::Pinned },
        Support { node_id: nz * nodes_per_row + nx, constraint_type: SupportType::Pinned },
    ];

    let pressure_loads = vec![PressureLoad {
        element_ids: (0..shells.len()).collect(),
        magnitude: 5.0,
    }];

    StructuralModel {
        nodes,
        beams: Vec::new(),
        shells,
        material: Material {
            name: "Steel".into(),
            elastic_modulus: 210e6,
            poisson_ratio: 0.3,
            density: 78.5,
        },
        supports,
        point_loads: Vec::new(),
        distributed_loads: Vec::new(),
        pressure_loads,
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let model = build_plate_model();
    let generator = CalculiXGenerator::new();
    let inp = generator.generate_inp_file(&model)?;

    std::fs::write("plate_benchmark.inp", &inp)?;
    println!("Input written to plate_benchmark.inp");

    let mut executor = CalculiXExecutor::new();
    std::env::set_var("CALCULIX_PATH", "ccx" );
    let rt = tokio::runtime::Runtime::new()?;
    let results = rt.block_on(executor.execute(&model, &inp))?;

    println!("Max displacement: {:.6} m", results.max_displacement);
    println!("Max stress: {:.6} Pa", results.max_stress);

    Ok(())
}
