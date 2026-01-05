//! FEA Solver Example - Simple Portal Frame

use fea_solver::prelude::*;

fn main() {
    println!("=== FEA Solver Example: Portal Frame ===\n");

    // Create a new model
    let mut model = FEModel::new();

    // Add steel material
    model
        .add_material("Steel", Material::steel())
        .expect("Failed to add material");

    // Add W12x26 section (approximate properties)
    // A = 7.65 in² = 0.00494 m²
    // Iy = 204 in⁴ = 8.49e-5 m⁴  
    // Iz = 17.3 in⁴ = 7.2e-6 m⁴
    // J = 0.3 in⁴ = 1.25e-7 m⁴
    model
        .add_section(
            "W12x26",
            Section::new(0.00494, 8.49e-5, 7.2e-6, 1.25e-7),
        )
        .expect("Failed to add section");

    // Create a simple portal frame
    //
    //     N3 -------- N4
    //     |          |
    //     |          |
    //     |          |
    //     N1        N2
    //     ^          ^
    //   Fixed     Fixed
    //

    // Add nodes (in meters)
    let height = 4.0; // 4m column height
    let span = 6.0; // 6m beam span

    model.add_node("N1", Node::new(0.0, 0.0, 0.0)).unwrap();
    model.add_node("N2", Node::new(span, 0.0, 0.0)).unwrap();
    model.add_node("N3", Node::new(0.0, height, 0.0)).unwrap();
    model.add_node("N4", Node::new(span, height, 0.0)).unwrap();

    // Add members
    // Left column
    model
        .add_member("Col1", Member::new("N1", "N3", "Steel", "W12x26"))
        .unwrap();
    // Right column
    model
        .add_member("Col2", Member::new("N2", "N4", "Steel", "W12x26"))
        .unwrap();
    // Beam
    model
        .add_member("Beam", Member::new("N3", "N4", "Steel", "W12x26"))
        .unwrap();

    // Add fixed supports at base
    model.add_support("N1", Support::fixed()).unwrap();
    model.add_support("N2", Support::fixed()).unwrap();

    // Add loads
    // Dead load case: 20 kN/m on beam (negative Y = downward)
    model
        .add_node_load(
            "N3",
            NodeLoad::force(0.0, -span * 20000.0 / 2.0, 0.0, "Dead"),
        )
        .unwrap();
    model
        .add_node_load(
            "N4",
            NodeLoad::force(0.0, -span * 20000.0 / 2.0, 0.0, "Dead"),
        )
        .unwrap();

    // Lateral load case: 10 kN at roof level (positive X)
    model
        .add_node_load("N3", NodeLoad::force(10000.0, 0.0, 0.0, "Wind"))
        .unwrap();

    // Add load combinations
    model
        .add_load_combo(
            LoadCombination::new("1.4D")
                .with_case("Dead", 1.4),
        )
        .unwrap();
    model
        .add_load_combo(
            LoadCombination::new("1.2D + 1.0W")
                .with_case("Dead", 1.2)
                .with_case("Wind", 1.0),
        )
        .unwrap();

    // Run analysis
    println!("Running linear analysis...\n");
    model.analyze_linear().expect("Analysis failed");

    // Print results for each load combination
    for combo_name in model.combo_names() {
        println!("=== Results for {} ===\n", combo_name);

        // Node displacements
        println!("Node Displacements:");
        for node_name in ["N1", "N2", "N3", "N4"] {
            let disp = model.node_displacement(node_name, &combo_name).unwrap();
            println!(
                "  {}: DX={:.4}mm, DY={:.4}mm, RZ={:.6}rad",
                node_name,
                disp.dx * 1000.0,
                disp.dy * 1000.0,
                disp.rz
            );
        }

        // Reactions
        println!("\nSupport Reactions:");
        for node_name in ["N1", "N2"] {
            let rxn = model.node_reactions(node_name, &combo_name).unwrap();
            println!(
                "  {}: FX={:.2}kN, FY={:.2}kN, MZ={:.2}kN·m",
                node_name,
                rxn.fx / 1000.0,
                rxn.fy / 1000.0,
                rxn.mz / 1000.0
            );
        }

        // Member forces
        println!("\nMember Forces:");
        for member_name in ["Col1", "Col2", "Beam"] {
            let forces_i = model.member_forces_i(member_name, &combo_name).unwrap();
            let forces_j = model.member_forces_j(member_name, &combo_name).unwrap();
            println!(
                "  {}: P={:.2}kN, Vmax={:.2}kN, Mmax={:.2}kN·m",
                member_name,
                forces_i.axial / 1000.0,
                forces_i.shear_y.abs().max(forces_j.shear_y.abs()) / 1000.0,
                forces_i.moment_z.abs().max(forces_j.moment_z.abs()) / 1000.0
            );
        }

        // Summary
        let summary = model.summary(&combo_name).unwrap();
        println!("\nSummary:");
        println!("  Max displacement: {:.4}mm at {}", summary.max_displacement * 1000.0, summary.max_disp_node);
        println!("  Max reaction: {:.2}kN at {}", summary.max_reaction / 1000.0, summary.max_reaction_node);
        println!("  Max axial: {:.2}kN in {}", summary.max_axial / 1000.0, summary.max_axial_member);
        println!("  Max moment: {:.2}kN·m in {}", summary.max_moment / 1000.0, summary.max_moment_member);
        println!();
    }

    // P-Delta analysis
    println!("=== P-Delta Analysis Comparison ===\n");
    
    model.analyze_p_delta().expect("P-Delta analysis failed");
    
    let disp_linear = model.node_displacement("N3", "1.2D + 1.0W").unwrap();
    println!("Lateral displacement at N3 (P-Delta): {:.4}mm", disp_linear.dx * 1000.0);
    
    println!("\n=== Analysis Complete ===");
}
