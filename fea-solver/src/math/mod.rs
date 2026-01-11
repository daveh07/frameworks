//! Mathematical utilities for FEA calculations

pub mod plate;
pub mod sparse;

use nalgebra::{DMatrix, DVector, Matrix3, Matrix6, SMatrix, SVector, Vector3};

// Re-export sparse utilities
pub use sparse::{
    SparseMatrixBuilder, SparseCholeskySolver,
    solve_cg, solve_pcg, reverse_cuthill_mckee,
};

pub type Mat = DMatrix<f64>;
pub type Vec = DVector<f64>;
pub type Mat3 = Matrix3<f64>;
pub type Mat6 = Matrix6<f64>;
pub type Vec3 = Vector3<f64>;

/// 12x12 matrix for member stiffness
pub type Mat12 = SMatrix<f64, 12, 12>;
/// 12-element vector for member forces/displacements  
pub type Vec12 = SVector<f64, 12>;
/// 24x24 matrix for plate stiffness
pub type Mat24 = SMatrix<f64, 24, 24>;
/// 24-element vector for plate forces/displacements
pub type Vec24 = SVector<f64, 24>;

// Re-export plate functions
pub use plate::{
    plate_local_stiffness, plate_local_stiffness_with_formulation,
    plate_transformation_matrix, plate_fer_pressure,
    plate_moments, plate_membrane_stress,
    PlateFormulation,
};

/// Compute the transformation matrix for a 3D frame element
/// 
/// # Arguments
/// * `i_node` - Start node coordinates [X, Y, Z]
/// * `j_node` - End node coordinates [X, Y, Z]
/// * `rotation` - Member rotation about its longitudinal axis (radians)
/// 
/// # Returns
/// 12x12 transformation matrix from local to global coordinates
pub fn member_transformation_matrix(
    i_node: &[f64; 3],
    j_node: &[f64; 3],
    rotation: f64,
) -> Mat12 {
    let dx = j_node[0] - i_node[0];
    let dy = j_node[1] - i_node[1];
    let dz = j_node[2] - i_node[2];
    
    let length = (dx * dx + dy * dy + dz * dz).sqrt();
    
    if length < 1e-10 {
        panic!("Member has zero length");
    }
    
    // Direction cosines for local x-axis (along member)
    let x = [dx / length, dy / length, dz / length];
    
    // Calculate local y and z axis directions
    // Following PyNite convention:
    // - For vertical members: y in XY plane (pointing -X for up, +X for down), z = global Z
    // - For horizontal members: y = global Y (up), z = x cross y
    // - For other members: z perpendicular to x with horizontal component, y = z cross x
    let (y, z) = if (x[0].abs() < 1e-10) && (x[2].abs() < 1e-10) {
        // Vertical member (X and Z components are zero, only Y component)
        // Match PyNite: y in XY plane, z parallel to global Z
        if x[1] > 0.0 {
            // Pointing up: y = [-1, 0, 0], z = [0, 0, 1]
            ([-1.0, 0.0, 0.0], [0.0, 0.0, 1.0])
        } else {
            // Pointing down: y = [1, 0, 0], z = [0, 0, 1]
            ([1.0, 0.0, 0.0], [0.0, 0.0, 1.0])
        }
    } else if dy.abs() < 1e-10 {
        // Horizontal member (no Y component)
        // Match PyNite: y = global Y, z = x cross y
        let y = [0.0, 1.0, 0.0];
        let z_unnorm = [
            x[1] * y[2] - x[2] * y[1],  // x cross y
            x[2] * y[0] - x[0] * y[2],
            x[0] * y[1] - x[1] * y[0],
        ];
        let z_len = (z_unnorm[0].powi(2) + z_unnorm[1].powi(2) + z_unnorm[2].powi(2)).sqrt();
        let z = [z_unnorm[0] / z_len, z_unnorm[1] / z_len, z_unnorm[2] / z_len];
        (y, z)
    } else {
        // Inclined member (has Y component but not purely vertical)
        // Match PyNite: find z perpendicular to x and horizontal (in XZ plane)
        // Project x onto global XZ plane
        let proj = [dx, 0.0, dz];
        
        let z_unnorm = if x[1] > 0.0 {
            // Member going upward: z = proj cross x
            [
                proj[1] * x[2] - proj[2] * x[1],
                proj[2] * x[0] - proj[0] * x[2],
                proj[0] * x[1] - proj[1] * x[0],
            ]
        } else {
            // Member going downward: z = x cross proj  
            [
                x[1] * proj[2] - x[2] * proj[1],
                x[2] * proj[0] - x[0] * proj[2],
                x[0] * proj[1] - x[1] * proj[0],
            ]
        };
        let z_len = (z_unnorm[0].powi(2) + z_unnorm[1].powi(2) + z_unnorm[2].powi(2)).sqrt();
        let z = [z_unnorm[0] / z_len, z_unnorm[1] / z_len, z_unnorm[2] / z_len];
        
        // y = z cross x
        let y = [
            z[1] * x[2] - z[2] * x[1],
            z[2] * x[0] - z[0] * x[2],
            z[0] * x[1] - z[1] * x[0],
        ];
        let y_len = (y[0].powi(2) + y[1].powi(2) + y[2].powi(2)).sqrt();
        let y = [y[0] / y_len, y[1] / y_len, y[2] / y_len];
        
        (y, z)
    };
    
    // Apply member rotation about local x-axis
    let (y, z) = if rotation.abs() > 1e-10 {
        let cos_r = rotation.cos();
        let sin_r = rotation.sin();
        
        let y_rot = [
            y[0] * cos_r + z[0] * sin_r,
            y[1] * cos_r + z[1] * sin_r,
            y[2] * cos_r + z[2] * sin_r,
        ];
        let z_rot = [
            -y[0] * sin_r + z[0] * cos_r,
            -y[1] * sin_r + z[1] * cos_r,
            -y[2] * sin_r + z[2] * cos_r,
        ];
        (y_rot, z_rot)
    } else {
        (y, z)
    };
    
    // Build 3x3 direction cosine matrix
    let r = Mat3::new(
        x[0], x[1], x[2],
        y[0], y[1], y[2],
        z[0], z[1], z[2],
    );
    
    // Build 12x12 transformation matrix
    let mut t = Mat12::zeros();
    
    // Fill diagonal 3x3 blocks
    for i in 0..4 {
        let offset = i * 3;
        for row in 0..3 {
            for col in 0..3 {
                t[(offset + row, offset + col)] = r[(row, col)];
            }
        }
    }
    
    t
}

/// Extract the 3x3 rotation matrix from a 12x12 transformation matrix
/// 
/// The transformation matrix has 4 identical 3x3 rotation blocks on the diagonal.
/// This extracts the first one.
pub fn extract_rotation_matrix(t: &Mat12) -> Mat3 {
    Mat3::new(
        t[(0, 0)], t[(0, 1)], t[(0, 2)],
        t[(1, 0)], t[(1, 1)], t[(1, 2)],
        t[(2, 0)], t[(2, 1)], t[(2, 2)],
    )
}

/// Compute the local stiffness matrix for a 3D frame element
/// 
/// # Arguments
/// * `e` - Modulus of elasticity
/// * `g` - Shear modulus
/// * `a` - Cross-sectional area
/// * `iy` - Moment of inertia about local y-axis
/// * `iz` - Moment of inertia about local z-axis
/// * `j` - Torsional constant
/// * `length` - Member length
/// 
/// # Returns
/// 12x12 local stiffness matrix
pub fn member_local_stiffness(
    e: f64,
    g: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    length: f64,
) -> Mat12 {
    let l = length;
    let l2 = l * l;
    let l3 = l2 * l;
    
    let ea_l = e * a / l;
    let gj_l = g * j / l;
    
    let eiy_l3 = e * iy / l3;
    let eiy_l2 = e * iy / l2;
    let eiy_l = e * iy / l;
    
    let eiz_l3 = e * iz / l3;
    let eiz_l2 = e * iz / l2;
    let eiz_l = e * iz / l;
    
    #[rustfmt::skip]
    let data = [
        // Row 0: axial at i
        ea_l,      0.0,          0.0,           0.0,    0.0,           0.0,          -ea_l,     0.0,          0.0,           0.0,    0.0,           0.0,
        // Row 1: shear Fy at i
        0.0,       12.0*eiz_l3,  0.0,           0.0,    0.0,           6.0*eiz_l2,   0.0,       -12.0*eiz_l3, 0.0,           0.0,    0.0,           6.0*eiz_l2,
        // Row 2: shear Fz at i
        0.0,       0.0,          12.0*eiy_l3,   0.0,    -6.0*eiy_l2,   0.0,          0.0,       0.0,          -12.0*eiy_l3,  0.0,    -6.0*eiy_l2,   0.0,
        // Row 3: torsion at i
        0.0,       0.0,          0.0,           gj_l,   0.0,           0.0,          0.0,       0.0,          0.0,           -gj_l,  0.0,           0.0,
        // Row 4: moment My at i
        0.0,       0.0,          -6.0*eiy_l2,   0.0,    4.0*eiy_l,     0.0,          0.0,       0.0,          6.0*eiy_l2,    0.0,    2.0*eiy_l,     0.0,
        // Row 5: moment Mz at i
        0.0,       6.0*eiz_l2,   0.0,           0.0,    0.0,           4.0*eiz_l,    0.0,       -6.0*eiz_l2,  0.0,           0.0,    0.0,           2.0*eiz_l,
        // Row 6: axial at j
        -ea_l,     0.0,          0.0,           0.0,    0.0,           0.0,          ea_l,      0.0,          0.0,           0.0,    0.0,           0.0,
        // Row 7: shear Fy at j
        0.0,       -12.0*eiz_l3, 0.0,           0.0,    0.0,           -6.0*eiz_l2,  0.0,       12.0*eiz_l3,  0.0,           0.0,    0.0,           -6.0*eiz_l2,
        // Row 8: shear Fz at j
        0.0,       0.0,          -12.0*eiy_l3,  0.0,    6.0*eiy_l2,    0.0,          0.0,       0.0,          12.0*eiy_l3,   0.0,    6.0*eiy_l2,    0.0,
        // Row 9: torsion at j
        0.0,       0.0,          0.0,           -gj_l,  0.0,           0.0,          0.0,       0.0,          0.0,           gj_l,   0.0,           0.0,
        // Row 10: moment My at j
        0.0,       0.0,          -6.0*eiy_l2,   0.0,    2.0*eiy_l,     0.0,          0.0,       0.0,          6.0*eiy_l2,    0.0,    4.0*eiy_l,     0.0,
        // Row 11: moment Mz at j
        0.0,       6.0*eiz_l2,   0.0,           0.0,    0.0,           2.0*eiz_l,    0.0,       -6.0*eiz_l2,  0.0,           0.0,    0.0,           4.0*eiz_l,
    ];
    
    Mat12::from_row_slice(&data)
}

/// Compute the geometric stiffness matrix for P-Delta analysis
/// 
/// # Arguments
/// * `p` - Axial force (positive = compression, negative = tension)
/// * `a` - Cross-sectional area
/// * `iy` - Moment of inertia about y
/// * `iz` - Moment of inertia about z
/// * `length` - Member length
pub fn member_geometric_stiffness(p: f64, a: f64, iy: f64, iz: f64, length: f64) -> Mat12 {
    if p.abs() < 1e-10 {
        return Mat12::zeros();
    }
    
    let l = length;
    let l2 = l * l;
    let ip = iy + iz;  // Polar moment of inertia
    
    let p_l = p / l;
    
    #[rustfmt::skip]
    let data = [
        // Geometric stiffness matrix terms
        p_l,        0.0,         0.0,          0.0,           0.0,             0.0,            -p_l,       0.0,         0.0,          0.0,           0.0,             0.0,
        0.0,        6.0*p_l/5.0, 0.0,          0.0,           0.0,             p_l*l/10.0,     0.0,        -6.0*p_l/5.0,0.0,          0.0,           0.0,             p_l*l/10.0,
        0.0,        0.0,         6.0*p_l/5.0,  0.0,           -p_l*l/10.0,     0.0,            0.0,        0.0,         -6.0*p_l/5.0, 0.0,           -p_l*l/10.0,     0.0,
        0.0,        0.0,         0.0,          p_l*ip/a,      0.0,             0.0,            0.0,        0.0,         0.0,          -p_l*ip/a,     0.0,             0.0,
        0.0,        0.0,         -p_l*l/10.0,  0.0,           2.0*p_l*l2/15.0, 0.0,            0.0,        0.0,         p_l*l/10.0,   0.0,           -p_l*l2/30.0,    0.0,
        0.0,        p_l*l/10.0,  0.0,          0.0,           0.0,             2.0*p_l*l2/15.0,0.0,        -p_l*l/10.0, 0.0,          0.0,           0.0,             -p_l*l2/30.0,
        -p_l,       0.0,         0.0,          0.0,           0.0,             0.0,            p_l,        0.0,         0.0,          0.0,           0.0,             0.0,
        0.0,        -6.0*p_l/5.0,0.0,          0.0,           0.0,             -p_l*l/10.0,    0.0,        6.0*p_l/5.0, 0.0,          0.0,           0.0,             -p_l*l/10.0,
        0.0,        0.0,         -6.0*p_l/5.0, 0.0,           p_l*l/10.0,      0.0,            0.0,        0.0,         6.0*p_l/5.0,  0.0,           p_l*l/10.0,      0.0,
        0.0,        0.0,         0.0,          -p_l*ip/a,     0.0,             0.0,            0.0,        0.0,         0.0,          p_l*ip/a,      0.0,             0.0,
        0.0,        0.0,         -p_l*l/10.0,  0.0,           -p_l*l2/30.0,    0.0,            0.0,        0.0,         p_l*l/10.0,   0.0,           2.0*p_l*l2/15.0, 0.0,
        0.0,        -p_l*l/10.0, 0.0,          0.0,           0.0,             -p_l*l2/30.0,   0.0,        p_l*l/10.0,  0.0,          0.0,           0.0,             2.0*p_l*l2/15.0,
    ];
    
    Mat12::from_row_slice(&data)
}

/// Apply static condensation for released DOFs
/// 
/// # Arguments
/// * `k` - Full stiffness matrix
/// * `releases` - Boolean array indicating which DOFs are released
pub fn apply_releases(k: &Mat12, releases: &[bool; 12]) -> Mat12 {
    // Find unreleased DOFs
    let unreleased: std::vec::Vec<usize> = releases
        .iter()
        .enumerate()
        .filter_map(|(i, &released)| if !released { Some(i) } else { None })
        .collect();
    
    let released: std::vec::Vec<usize> = releases
        .iter()
        .enumerate()
        .filter_map(|(i, &released)| if released { Some(i) } else { None })
        .collect();
    
    if released.is_empty() {
        return *k;
    }
    
    let n1 = unreleased.len();
    let n2 = released.len();
    
    // Partition into k11, k12, k21, k22
    let mut k11 = DMatrix::zeros(n1, n1);
    let mut k12 = DMatrix::zeros(n1, n2);
    let mut k21 = DMatrix::zeros(n2, n1);
    let mut k22 = DMatrix::zeros(n2, n2);
    
    for (i, &ui) in unreleased.iter().enumerate() {
        for (j, &uj) in unreleased.iter().enumerate() {
            k11[(i, j)] = k[(ui, uj)];
        }
        for (j, &rj) in released.iter().enumerate() {
            k12[(i, j)] = k[(ui, rj)];
        }
    }
    
    for (i, &ri) in released.iter().enumerate() {
        for (j, &uj) in unreleased.iter().enumerate() {
            k21[(i, j)] = k[(ri, uj)];
        }
        for (j, &rj) in released.iter().enumerate() {
            k22[(i, j)] = k[(ri, rj)];
        }
    }
    
    // Static condensation: k_cond = k11 - k12 * inv(k22) * k21
    let k22_inv = match k22.clone().try_inverse() {
        Some(inv) => inv,
        None => return *k, // Return original if singular
    };
    
    let k_condensed = &k11 - &k12 * &k22_inv * &k21;
    
    // Expand back to 12x12 with zeros for released DOFs
    let mut k_result = Mat12::zeros();
    
    for (i, &ui) in unreleased.iter().enumerate() {
        for (j, &uj) in unreleased.iter().enumerate() {
            k_result[(ui, uj)] = k_condensed[(i, j)];
        }
    }
    
    k_result
}

/// Apply static condensation to the fixed end reaction vector for released DOFs
/// Following PyNite's method: fer_condensed = fer1 - k12 * inv(k22) * fer2
/// 
/// # Arguments
/// * `fer` - Uncondensed fixed end reaction vector  
/// * `k` - Uncondensed local stiffness matrix
/// * `releases` - Boolean array indicating which DOFs are released
pub fn apply_fer_releases(fer: &Vec12, k: &Mat12, releases: &[bool; 12]) -> Vec12 {
    // Find unreleased and released DOFs
    let unreleased: std::vec::Vec<usize> = releases
        .iter()
        .enumerate()
        .filter_map(|(i, &released)| if !released { Some(i) } else { None })
        .collect();
    
    let released: std::vec::Vec<usize> = releases
        .iter()
        .enumerate()
        .filter_map(|(i, &released)| if released { Some(i) } else { None })
        .collect();
    
    if released.is_empty() {
        return *fer;
    }
    
    let n1 = unreleased.len();
    let n2 = released.len();
    
    // Partition stiffness matrix k12 and k22
    let mut k12 = DMatrix::zeros(n1, n2);
    let mut k22 = DMatrix::zeros(n2, n2);
    
    for (i, &ui) in unreleased.iter().enumerate() {
        for (j, &rj) in released.iter().enumerate() {
            k12[(i, j)] = k[(ui, rj)];
        }
    }
    
    for (i, &ri) in released.iter().enumerate() {
        for (j, &rj) in released.iter().enumerate() {
            k22[(i, j)] = k[(ri, rj)];
        }
    }
    
    // Partition FER vector: fer1 (unreleased), fer2 (released)
    let mut fer1 = DVector::zeros(n1);
    let mut fer2 = DVector::zeros(n2);
    
    for (i, &ui) in unreleased.iter().enumerate() {
        fer1[i] = fer[ui];
    }
    for (i, &ri) in released.iter().enumerate() {
        fer2[i] = fer[ri];
    }
    
    // Static condensation: fer_condensed = fer1 - k12 * inv(k22) * fer2
    let k22_inv = match k22.clone().try_inverse() {
        Some(inv) => inv,
        None => return *fer, // Return original if singular
    };
    
    let fer_condensed = &fer1 - &k12 * &k22_inv * &fer2;
    
    // Expand back to 12-element vector with zeros for released DOFs
    let mut fer_result = Vec12::zeros();
    
    for (i, &ui) in unreleased.iter().enumerate() {
        fer_result[ui] = fer_condensed[i];
    }
    // Released DOFs remain zero
    
    fer_result
}

/// Compute fixed end reactions for a uniformly distributed load
/// 
/// # Arguments
/// * `w` - Load intensity (force per unit length)
/// * `length` - Member length
/// * `direction` - Load direction index (0=X, 1=Y, 2=Z in local coords)
pub fn fer_uniform_load(w: f64, length: f64, direction: usize) -> Vec12 {
    let l = length;
    let l2 = l * l;
    
    let mut fer = Vec12::zeros();
    
    match direction {
        0 => {
            // Axial load
            fer[0] = -w * l / 2.0;
            fer[6] = -w * l / 2.0;
        }
        1 => {
            // Load in local y direction
            fer[1] = -w * l / 2.0;
            fer[5] = -w * l2 / 12.0;
            fer[7] = -w * l / 2.0;
            fer[11] = w * l2 / 12.0;
        }
        2 => {
            // Load in local z direction
            fer[2] = -w * l / 2.0;
            fer[4] = w * l2 / 12.0;
            fer[8] = -w * l / 2.0;
            fer[10] = -w * l2 / 12.0;
        }
        _ => {}
    }
    
    fer
}

/// Compute fixed end reactions for a point load
/// 
/// # Arguments
/// * `p` - Load magnitude
/// * `a` - Distance from i-node to load
/// * `length` - Member length
/// * `direction` - Load direction index (0=X, 1=Y, 2=Z in local coords)
pub fn fer_point_load(p: f64, a: f64, length: f64, direction: usize) -> Vec12 {
    let l = length;
    let b = l - a;
    let l2 = l * l;
    let l3 = l2 * l;
    
    let mut fer = Vec12::zeros();
    
    match direction {
        0 => {
            // Axial load
            fer[0] = -p * b / l;
            fer[6] = -p * a / l;
        }
        1 => {
            // Load in local y direction
            fer[1] = -p * b * b * (3.0 * a + b) / l3;
            fer[5] = -p * a * b * b / l2;
            fer[7] = -p * a * a * (a + 3.0 * b) / l3;
            fer[11] = p * a * a * b / l2;
        }
        2 => {
            // Load in local z direction
            fer[2] = -p * b * b * (3.0 * a + b) / l3;
            fer[4] = p * a * b * b / l2;
            fer[8] = -p * a * a * (a + 3.0 * b) / l3;
            fer[10] = -p * a * a * b / l2;
        }
        _ => {}
    }
    
    fer
}

/// Solve a linear system using LU decomposition
pub fn solve_linear_system(a: &Mat, b: &Vec) -> Option<Vec> {
    a.clone().lu().solve(b)
}

/// Solve a linear system using Cholesky decomposition (for symmetric positive definite)
pub fn solve_cholesky(a: &Mat, b: &Vec) -> Option<Vec> {
    a.clone().cholesky().map(|chol| chol.solve(b))
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_transformation_matrix_horizontal() {
        let i = [0.0, 0.0, 0.0];
        let j = [10.0, 0.0, 0.0];
        let t = member_transformation_matrix(&i, &j, 0.0);
        
        // For horizontal member along X (PyNite convention):
        // local x = global X (direction of member)
        // local y = global Y (upward)
        // local z = global Z (x cross y for member along +X)
        assert_relative_eq!(t[(0, 0)], 1.0, epsilon = 1e-10);  // local x = global X
        assert_relative_eq!(t[(1, 1)], 1.0, epsilon = 1e-10);  // local y = global Y
        assert_relative_eq!(t[(2, 2)], 1.0, epsilon = 1e-10);  // local z = global Z
    }

    #[test]
    fn test_transformation_matrix_vertical() {
        let i = [0.0, 0.0, 0.0];
        let j = [0.0, 10.0, 0.0];
        let t = member_transformation_matrix(&i, &j, 0.0);
        
        // For vertical member pointing up (PyNite convention):
        // local x = global Y (direction of member)
        // local y = negative global X (so column bending in XY plane uses local z)
        // local z = global Z
        assert_relative_eq!(t[(0, 1)], 1.0, epsilon = 1e-10);   // local x = global Y
        assert_relative_eq!(t[(1, 0)], -1.0, epsilon = 1e-10);  // local y = -global X
        assert_relative_eq!(t[(2, 2)], 1.0, epsilon = 1e-10);   // local z = global Z
    }

    #[test]
    fn test_local_stiffness_symmetry() {
        let k = member_local_stiffness(200e9, 77e9, 0.01, 1e-4, 2e-4, 1e-5, 10.0);
        
        // Check symmetry
        for i in 0..12 {
            for j in 0..12 {
                if (k[(i, j)] - k[(j, i)]).abs() > 1e-6 {
                    eprintln!("Asymmetry at ({}, {}): {} vs {}", i, j, k[(i, j)], k[(j, i)]);
                }
                assert_relative_eq!(k[(i, j)], k[(j, i)], epsilon = 1e-6);
            }
        }
    }
}
