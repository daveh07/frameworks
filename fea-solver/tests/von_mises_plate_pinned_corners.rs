use fea_solver::prelude::*;

fn env_usize(name: &str, default_val: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|&v| v > 0)
        .unwrap_or(default_val)
}

fn build_pinned_corners_plate_model(nx: usize, ny: usize) -> FEModel {
    // Parameters (SI base units)
    // Plate size: 2m x 1m
    let lx = 2.0_f64;
    let ly = 1.0_f64;

    // Material: Structural steel
    // E = 200,000 MPa = 200e9 Pa
    let e = 200_000.0e6_f64;
    let nu = 0.27_f64;
    let rho = 7850.0_f64;

    // Plate thickness: 10 mm
    let t = 0.01_f64;

    // Pressure load: 1 kPa normal to plate
    let p = 1000.0_f64;

    let mut model = FEModel::new();

    model
        .add_material("Steel", Material::isotropic(e, nu, rho))
        .unwrap();

    // Create a structured grid of nodes in the XY plane at Z=0.
    // Node naming: N_{i}_{j}, with i along X, j along Y.
    for j in 0..=ny {
        let y = ly * (j as f64) / (ny as f64);
        for i in 0..=nx {
            let x = lx * (i as f64) / (nx as f64);
            let name = format!("N_{i}_{j}");
            model.add_node(&name, Node::new(x, y, 0.0)).unwrap();
        }
    }

    // Corner supports: FFFRRR (3D Pin)
    // i.e. translations fixed, rotations free
    let pinned = Support::pinned();
    model.add_support("N_0_0", pinned).unwrap();
    model
        .add_support(&format!("N_{nx}_0"), pinned)
        .unwrap();
    model
        .add_support(&format!("N_{nx}_{ny}"), pinned)
        .unwrap();
    model
        .add_support(&format!("N_0_{ny}"), pinned)
        .unwrap();

    // Plates + pressure load on each element.
    // Plate node order is CCW: (bl, br, tr, tl) for a plate in the XY plane.
    for j in 0..ny {
        for i in 0..nx {
            let n_bl = format!("N_{i}_{j}");
            let n_br = format!("N_{}_{}", i + 1, j);
            let n_tr = format!("N_{}_{}", i + 1, j + 1);
            let n_tl = format!("N_{}_{}", i, j + 1);

            let plate_name = format!("P_{i}_{j}");

            let plate = Plate::new(&n_bl, &n_br, &n_tr, &n_tl, t, "Steel")
                .with_formulation(PlateFormulation::Mindlin);

            model.add_plate(&plate_name, plate).unwrap();

            // Apply a uniform pressure normal to the plate.
            // For a plate in the XY plane, "downward" corresponds to -Z (local).
            model
                .add_plate_load(&plate_name, PlateLoad::downward(p, "Case 1"))
                .unwrap();
        }
    }

    model
}

#[test]
fn von_mises_plate_pinned_corners_sanity() {
    // Mesh density is controllable so you can match a commercial FEA mesh.
    // Defaults chosen to keep test runtime reasonable.
    let nx = env_usize("FEA_PLATE_MESH_NX", 10);
    let ny = env_usize("FEA_PLATE_MESH_NY", 5);

    let mut model = build_pinned_corners_plate_model(nx, ny);
    model.analyze_linear().unwrap();

    let combo = "Combo 1";

    let mut max_vm = -f64::INFINITY;
    let mut max_plate = String::new();
    let mut sum_vm = 0.0_f64;
    let mut count = 0_u64;

    for j in 0..ny {
        for i in 0..nx {
            let plate_name = format!("P_{i}_{j}");
            let s = model.plate_stress(&plate_name, combo).unwrap();
            let vm = s.von_mises;
            assert!(vm.is_finite(), "von Mises should be finite");
            if vm > max_vm {
                max_vm = vm;
                max_plate = plate_name;
            }
            sum_vm += vm;
            count += 1;
        }
    }

    assert!(count > 0);
    assert!(max_vm > 0.0, "von Mises should be > 0 for loaded plate");

    // ---------------------------
    // Max deflection (Z) at center
    // ---------------------------
    let mut max_defl_z = 0.0_f64;
    let mut max_defl_node = String::new();
    for j in 0..=ny {
        for i in 0..=nx {
            let node_name = format!("N_{i}_{j}");
            let disp = model.node_displacement(&node_name, combo).unwrap();
            // Z displacement field
            let dz = disp.dz;
            if dz.abs() > max_defl_z.abs() {
                max_defl_z = dz;
                max_defl_node = node_name;
            }
        }
    }

    // ---------------------------
    // Reactions at corners
    // ---------------------------
    let corner_nodes = [
        "N_0_0".to_string(),
        format!("N_{nx}_0"),
        format!("N_{nx}_{ny}"),
        format!("N_0_{ny}"),
    ];
    let mut reactions = Vec::new();
    for cn in &corner_nodes {
        if let Ok(r) = model.node_reactions(cn, combo) {
            reactions.push((cn.clone(), r.fz)); // Z reaction
        }
    }

    // ---------------------------
    // Max moments (Mx, My)
    // ---------------------------
    let mut max_mx: f64 = 0.0;
    let mut max_my: f64 = 0.0;
    for j in 0..ny {
        for i in 0..nx {
            let plate_name = format!("P_{i}_{j}");
            let s = model.plate_stress(&plate_name, combo).unwrap();
            if s.mx.abs() > max_mx.abs() {
                max_mx = s.mx;
            }
            if s.my.abs() > max_my.abs() {
                max_my = s.my;
            }
        }
    }

    // Helpful output for comparing with a commercial solver.
    // Run with: cargo test -p fea-solver von_mises_plate_pinned_corners_sanity -- --nocapture
    eprintln!("Pinned-corners plate von Mises test");
    eprintln!("  mesh: nx={nx}, ny={ny} (elements={})", nx * ny);
    eprintln!("  max von Mises: {:.6} MPa @ {max_plate}", max_vm / 1e6);
    eprintln!("  avg von Mises: {:.6} MPa", (sum_vm / count as f64) / 1e6);
    eprintln!("  max Z deflection: {:.6} mm @ {max_defl_node}", max_defl_z * 1000.0);
    eprintln!("  max Mx: {:.6} kN-m/m", max_mx / 1000.0);
    eprintln!("  max My: {:.6} kN-m/m", max_my / 1000.0);
    eprintln!("Corner reactions (Z in kN):");
    for (name, rz) in &reactions {
        eprintln!("  {name}: {:.6} kN", rz / 1000.0);
    }
}

#[test]
#[ignore]
fn von_mises_plate_pinned_corners_report_csv() {
    // Emits a CSV table you can paste into a spreadsheet.
    // Run with:
    //   cargo test -p fea-solver von_mises_plate_pinned_corners_report_csv -- --ignored --nocapture
    let nx = env_usize("FEA_PLATE_MESH_NX", 10);
    let ny = env_usize("FEA_PLATE_MESH_NY", 5);

    let mut model = build_pinned_corners_plate_model(nx, ny);
    model.analyze_linear().unwrap();

    let combo = "Combo 1";

    println!("plate,i,j,von_mises_mpa,sx_mpa,sy_mpa,txy_mpa,mx,my,mxy");
    for j in 0..ny {
        for i in 0..nx {
            let plate_name = format!("P_{i}_{j}");
            let s = model.plate_stress(&plate_name, combo).unwrap();
            println!(
                "{plate_name},{i},{j},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6}",
                s.von_mises / 1e6,
                s.sx / 1e6,
                s.sy / 1e6,
                s.txy / 1e6,
                s.mx,
                s.my,
                s.mxy
            );
        }
    }
}
