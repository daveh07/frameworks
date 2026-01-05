use nalgebra::{DMatrix, DVector};

fn main() {
    // Parameters
    let l = 6.0_f64;  // m
    let e = 200.0e9;  // Pa
    let i = 0.001125; // m^4
    let a = 0.1;      // m^2
    let p = 60000.0;  // N

    println!("=== CANTILEVER BEAM DEBUG ===");
    println!("L={}, E={}, I={}, A={}", l, e, i, a);
    println!("Point load P={} at tip", p);
    
    // Analytical solution
    let delta_expected = p * l.powi(3) / (3.0 * e * i);
    let moment_expected = p * l;
    println!("\nExpected: delta = {:.6} m, M_fixed = {} N·m", delta_expected, moment_expected);
    
    let ei_l3 = e * i / l.powi(3);
    let ei_l2 = e * i / l.powi(2);  
    let ei_l = e * i / l;
    let ea_l = e * a / l;
    
    println!("\nStiffness terms:");
    println!("EA/L = {}", ea_l);
    println!("12EI/L³ = {}", 12.0 * ei_l3);
    println!("6EI/L² = {}", 6.0 * ei_l2);
    println!("4EI/L = {}", 4.0 * ei_l);
    
    // Full 6x6 stiffness matrix (2 nodes, 3 DOFs each for 2D beam)
    // DOFs: [u0, v0, θ0, u1, v1, θ1]
    let k: [[f64; 6]; 6] = [
        [ea_l, 0.0, 0.0, -ea_l, 0.0, 0.0],
        [0.0, 12.0*ei_l3, 6.0*ei_l2, 0.0, -12.0*ei_l3, 6.0*ei_l2],
        [0.0, 6.0*ei_l2, 4.0*ei_l, 0.0, -6.0*ei_l2, 2.0*ei_l],
        [-ea_l, 0.0, 0.0, ea_l, 0.0, 0.0],
        [0.0, -12.0*ei_l3, -6.0*ei_l2, 0.0, 12.0*ei_l3, -6.0*ei_l2],
        [0.0, 6.0*ei_l2, 2.0*ei_l, 0.0, -6.0*ei_l2, 4.0*ei_l],
    ];
    
    println!("\nFull stiffness matrix:");
    for row in &k {
        println!("{:12.3e} {:12.3e} {:12.3e} {:12.3e} {:12.3e} {:12.3e}", 
            row[0], row[1], row[2], row[3], row[4], row[5]);
    }
    
    // For cantilever: fixed at node 0 (DOFs 0,1,2), free at node 1 (DOFs 3,4,5)
    // K_ff is bottom-right 3x3 block
    let k_ff: [[f64; 3]; 3] = [
        [k[3][3], k[3][4], k[3][5]],
        [k[4][3], k[4][4], k[4][5]],
        [k[5][3], k[5][4], k[5][5]],
    ];
    
    println!("\nReduced stiffness K_ff (free DOFs only):");
    for row in &k_ff {
        println!("{:12.3e} {:12.3e} {:12.3e}", row[0], row[1], row[2]);
    }
    
    // Load at tip: F = [0, -P, 0] (axial, transverse, moment)
    let f_f = [0.0, -p, 0.0];
    println!("\nLoad vector F_f: [{}, {}, {}]", f_f[0], f_f[1], f_f[2]);
    
    // Solve K_ff * d_f = F_f
    let k_matrix = DMatrix::from_row_slice(3, 3, &[
        k_ff[0][0], k_ff[0][1], k_ff[0][2],
        k_ff[1][0], k_ff[1][1], k_ff[1][2],
        k_ff[2][0], k_ff[2][1], k_ff[2][2],
    ]);
    let f_vector = DVector::from_vec(vec![f_f[0], f_f[1], f_f[2]]);
    
    let d_f = k_matrix.lu().solve(&f_vector).unwrap();
    println!("\nDisplacements at free node (u1, v1, θ1):");
    println!("u1 (axial) = {:.6e} m", d_f[0]);
    println!("v1 (transverse) = {:.6e} m (expected: {:.6e})", d_f[1], -delta_expected);
    println!("θ1 (rotation) = {:.6e} rad", d_f[2]);
    
    let ratio = d_f[1].abs() / delta_expected;
    println!("\nRatio |v1|/expected = {:.4}", ratio);
}
