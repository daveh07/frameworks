use fea_solver::prelude::*;

fn main() {
    let mut model = FEModel::new();
    
    // Add nodes
    model.add_node("N1", Node::new(0.0, 0.0, 0.0)).unwrap();
    model.add_node("N2", Node::new(6.0, 0.0, 0.0)).unwrap();
    
    // Add material and section  
    model.add_material("steel", Material::isotropic(200.0e9, 0.3, 7850.0)).unwrap();
    model.add_section("beam_section", Section::new(0.1, 0.001125, 0.001125, 0.00015)).unwrap();
    
    // Add beam member
    model.add_member("M1", Member::new("N1", "N2", "steel", "beam_section")).unwrap();
    
    // Add fixed support at N1
    model.add_support("N1", Support::fixed()).unwrap();
    
    // Add point load at N2 (downward)
    model.add_node_load("N2", NodeLoad::force(0.0, -60000.0, 0.0, "LC1")).unwrap();
    
    // Define load combination
    model.add_load_combo(LoadCombination::new("Combo1").with_case("LC1", 1.0)).unwrap();
    
    println!("=== MODEL SETUP ===");
    println!("Nodes: {:?}", model.nodes.keys().collect::<Vec<_>>());
    println!("Members: {:?}", model.members.keys().collect::<Vec<_>>());
    
    // Solve
    println!("\nRunning analysis...");
    match model.analyze_linear() {
        Ok(_) => {
            println!("\n=== SOLUTION ===");
            
            // Get displacements
            if let Ok(d) = model.node_displacement("N2", "Combo1") {
                println!("N2 displacements: dx={}, dy={}, dz={}", d.dx, d.dy, d.dz);
                println!("v (transverse Y) = {} m", d.dy);
                println!("Expected v = -0.0192 m");
                println!("Ratio = {}", d.dy / -0.0192);
            }
            
            // Get reactions
            if let Ok(r) = model.node_reactions("N1", "Combo1") {
                println!("\nN1 reactions: fx={}, fy={}, mz={}", r.fx, r.fy, r.mz);
                println!("R_y (shear) = {} N (expected 60000)", r.fy);
                println!("M_z (moment) = {} N·m (expected 360000)", r.mz);
            }
            
            // Get member forces
            if let Ok(f_i) = model.member_forces_i("M1", "Combo1") {
                println!("\nM1 end forces at i-node: axial={}, shear_y={}, moment_z={}", 
                    f_i.axial, f_i.shear_y, f_i.moment_z);
            }
            if let Ok(f_j) = model.member_forces_j("M1", "Combo1") {
                println!("M1 end forces at j-node: axial={}, shear_y={}, moment_z={}", 
                    f_j.axial, f_j.shear_y, f_j.moment_z);
            }
        }
        Err(e) => {
            println!("Solve failed: {}", e);
        }
    }
}
