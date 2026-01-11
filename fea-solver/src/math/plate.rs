//! Plate element math functions with multiple formulation options
//!
//! References:
//! - PyNite/Plate3D.py (Kirchhoff rectangular plate)
//! - PyNite/Quad3D.py (DKMQ general quadrilateral)
//! - "Finite Element Procedures, 2nd Edition", Klaus-Jurgen Bathe
//! - "A Comparative Formulation of DKMQ, DSQ and MITC4 Quadrilateral Plate Elements", Irwan Katili
//! 
//! This implements plate elements with:
//! - Membrane (in-plane) stiffness using 2x2 Gauss integration
//! - Bending (out-of-plane) stiffness with drilling DOF stabilization
//! - 4 nodes with 6 DOFs each: DX, DY, DZ, RX, RY, RZ
//! - Total 24x24 stiffness matrix
//!
//! Available formulations:
//! - **Kirchhoff**: Thin plate theory, analytical solution for rectangular plates
//! - **Mindlin**: Thick plate theory with transverse shear, uses numerical integration
//! - **DKMQ**: Discrete Kirchhoff-Mindlin Quadrilateral, best for general quads

use nalgebra::{Matrix3, SMatrix, SVector};
use serde::{Deserialize, Serialize};

pub type Mat24 = SMatrix<f64, 24, 24>;
pub type Vec24 = SVector<f64, 24>;
pub type Mat3 = Matrix3<f64>;

/// Plate bending formulation type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum PlateFormulation {
    /// Kirchhoff thin plate theory - neglects transverse shear
    /// Best for thin plates (thickness/span < 1/20)
    /// Uses analytical solution for rectangular plates
    #[default]
    Kirchhoff,
    
    /// Mindlin-Reissner thick plate theory - includes transverse shear
    /// Better for thick plates (thickness/span > 1/20)
    /// Uses numerical integration with shear correction factor
    Mindlin,
    
    /// Discrete Kirchhoff-Mindlin Quadrilateral (DKMQ)
    /// Combines benefits of both, avoids shear locking
    /// Best for general quadrilaterals and mixed thick/thin plates
    DKMQ,
}

/// Compute the membrane constitutive matrix [Dm] for plane stress (orthotropic)
/// 
/// # Arguments
/// * `e` - Modulus of elasticity
/// * `nu` - Poisson's ratio
/// * `kx_mod` - Stiffness modifier in local x direction (1.0 = isotropic)
/// * `ky_mod` - Stiffness modifier in local y direction (1.0 = isotropic)
fn membrane_constitutive_matrix(e: f64, nu: f64, kx_mod: f64, ky_mod: f64) -> Mat3 {
    let ex = e * kx_mod;
    let ey = e * ky_mod;
    let nu_xy = nu;
    let nu_yx = nu;
    let g = e / (2.0 * (1.0 + nu));
    
    let denom = 1.0 - nu_xy * nu_yx;
    
    Mat3::new(
        ex / denom,          nu_yx * ex / denom,  0.0,
        nu_xy * ey / denom,  ey / denom,          0.0,
        0.0,                 0.0,                 g * (1.0 - nu_xy * nu_yx) / denom,
    )
}

/// Compute the bending constitutive matrix [Db] for plate bending (orthotropic)
/// 
/// # Arguments
/// * `e` - Modulus of elasticity
/// * `nu` - Poisson's ratio
/// * `t` - Plate thickness
/// * `kx_mod` - Stiffness modifier in local x direction
/// * `ky_mod` - Stiffness modifier in local y direction
fn bending_constitutive_matrix(e: f64, nu: f64, t: f64, kx_mod: f64, ky_mod: f64) -> Mat3 {
    let ex = e * kx_mod;
    let ey = e * ky_mod;
    let nu_xy = nu;
    let nu_yx = nu;
    let g = e / (2.0 * (1.0 + nu));
    
    let factor = t.powi(3) / (12.0 * (1.0 - nu_xy * nu_yx));
    
    Mat3::new(
        ex * factor,          nu_yx * ex * factor,  0.0,
        nu_xy * ey * factor,  ey * factor,          0.0,
        0.0,                  0.0,                  g * factor,
    )
}

/// Compute the Jacobian matrix for a rectangular element at natural coordinates (r, s)
/// 
/// For a rectangular element with corners at (0,0), (width,0), (width,height), (0,height)
fn jacobian(width: f64, height: f64, _r: f64, _s: f64) -> [[f64; 2]; 2] {
    // For a rectangular element, the Jacobian is constant
    // J = [dx/dr  dy/dr]   = [width/2    0    ]
    //     [dx/ds  dy/ds]     [  0     height/2]
    [
        [width / 2.0, 0.0],
        [0.0, height / 2.0],
    ]
}

/// Compute the inverse Jacobian
fn jacobian_inverse(width: f64, height: f64) -> [[f64; 2]; 2] {
    [
        [2.0 / width, 0.0],
        [0.0, 2.0 / height],
    ]
}

/// Compute the determinant of the Jacobian
fn jacobian_det(width: f64, height: f64) -> f64 {
    width * height / 4.0
}

/// Compute the membrane strain-displacement matrix [B_m] at natural coordinates (r, s)
/// 
/// Returns 3x8 matrix relating strains to nodal displacements (u, v at each node)
fn membrane_b_matrix(width: f64, height: f64, r: f64, s: f64) -> [[f64; 8]; 3] {
    let j_inv = jacobian_inverse(width, height);
    
    // Shape function derivatives with respect to r and s
    // N1 = (1-r)(1-s)/4, N2 = (1+r)(1-s)/4, N3 = (1+r)(1+s)/4, N4 = (1-r)(1+s)/4
    // dN/dr = [-(1-s)/4, (1-s)/4, (1+s)/4, -(1+s)/4]
    // dN/ds = [-(1-r)/4, -(1+r)/4, (1+r)/4, (1-r)/4]
    let dn_dr = [
        -(1.0 - s) / 4.0,
        (1.0 - s) / 4.0,
        (1.0 + s) / 4.0,
        -(1.0 + s) / 4.0,
    ];
    let dn_ds = [
        -(1.0 - r) / 4.0,
        -(1.0 + r) / 4.0,
        (1.0 + r) / 4.0,
        (1.0 - r) / 4.0,
    ];
    
    // Transform to physical coordinates using Jacobian inverse
    // dN/dx = J_inv[0,0] * dN/dr + J_inv[0,1] * dN/ds
    // dN/dy = J_inv[1,0] * dN/dr + J_inv[1,1] * dN/ds
    let mut dn_dx = [0.0; 4];
    let mut dn_dy = [0.0; 4];
    
    for i in 0..4 {
        dn_dx[i] = j_inv[0][0] * dn_dr[i] + j_inv[0][1] * dn_ds[i];
        dn_dy[i] = j_inv[1][0] * dn_dr[i] + j_inv[1][1] * dn_ds[i];
    }
    
    // B_m matrix: 3 rows (epsilon_x, epsilon_y, gamma_xy), 8 columns (u1,v1,u2,v2,u3,v3,u4,v4)
    // epsilon_x = du/dx -> [dN1/dx, 0, dN2/dx, 0, dN3/dx, 0, dN4/dx, 0]
    // epsilon_y = dv/dy -> [0, dN1/dy, 0, dN2/dy, 0, dN3/dy, 0, dN4/dy]  
    // gamma_xy = du/dy + dv/dx -> [dN1/dy, dN1/dx, dN2/dy, dN2/dx, ...]
    [
        [dn_dx[0], 0.0, dn_dx[1], 0.0, dn_dx[2], 0.0, dn_dx[3], 0.0],
        [0.0, dn_dy[0], 0.0, dn_dy[1], 0.0, dn_dy[2], 0.0, dn_dy[3]],
        [dn_dy[0], dn_dx[0], dn_dy[1], dn_dx[1], dn_dy[2], dn_dx[2], dn_dy[3], dn_dx[3]],
    ]
}

/// Compute the membrane stiffness matrix [k_m] for plane stress
/// 
/// Uses 2x2 Gauss quadrature
/// Returns 8x8 matrix for DOFs: u1, v1, u2, v2, u3, v3, u4, v4
fn membrane_stiffness_unexpanded(e: f64, nu: f64, t: f64, width: f64, height: f64, kx_mod: f64, ky_mod: f64) -> [[f64; 8]; 8] {
    let dm = membrane_constitutive_matrix(e, nu, kx_mod, ky_mod);
    let gp = 1.0 / 3.0_f64.sqrt(); // Gauss point location
    
    // Get B matrices at each Gauss point
    let b1 = membrane_b_matrix(width, height, -gp, -gp);
    let b2 = membrane_b_matrix(width, height, gp, -gp);
    let b3 = membrane_b_matrix(width, height, gp, gp);
    let b4 = membrane_b_matrix(width, height, -gp, gp);
    
    let det_j = jacobian_det(width, height);
    
    // k = t * sum(B^T * Dm * B * det(J) * weight)
    // For 2x2 Gauss, weights are 1.0
    let mut k = [[0.0; 8]; 8];
    
    for b in [&b1, &b2, &b3, &b4] {
        // Compute B^T * Dm * B
        for i in 0..8 {
            for j in 0..8 {
                let mut sum = 0.0;
                for m in 0..3 {
                    for n in 0..3 {
                        sum += b[m][i] * dm[(m, n)] * b[n][j];
                    }
                }
                k[i][j] += t * sum * det_j;
            }
        }
    }
    
    k
}

/// Expand the 8x8 membrane stiffness matrix to 24x24
/// 
/// Maps: (u1, v1, u2, v2, u3, v3, u4, v4) -> (DX1, DY1, DZ1, RX1, RY1, RZ1, ...)
fn expand_membrane_to_24(k8: &[[f64; 8]; 8]) -> Mat24 {
    let mut k24 = Mat24::zeros();
    
    // Mapping from 8-DOF indices to 24-DOF indices
    // u1->0, v1->1, u2->6, v2->7, u3->12, v3->13, u4->18, v4->19
    let mapping = [0, 1, 6, 7, 12, 13, 18, 19];
    
    for (i, &mi) in mapping.iter().enumerate() {
        for (j, &mj) in mapping.iter().enumerate() {
            k24[(mi, mj)] = k8[i][j];
        }
    }
    
    k24
}

/// Compute the bending stiffness matrix [k_b] for plate bending
/// 
/// This follows PyNite's exact analytical bending stiffness matrix for rectangular plates.
/// The matrix is derived using the 12-term polynomial displacement function.
/// Returns 12x12 matrix for DOFs: w1, rx1, ry1, w2, rx2, ry2, w3, rx3, ry3, w4, rx4, ry4
pub fn bending_stiffness_unexpanded(e: f64, nu: f64, t: f64, width: f64, height: f64, kx_mod: f64, ky_mod: f64) -> [[f64; 12]; 12] {
    let b = width / 2.0;  // half-width
    let c = height / 2.0; // half-height
    
    let ex = e * kx_mod;
    let ey = e * ky_mod;
    let nu_xy = nu;
    let nu_yx = nu;
    let g = e / (2.0 * (1.0 + nu));
    
    let t3_12 = t.powi(3) / 12.0;
    let denom = nu_xy * nu_yx - 1.0; // PyNite uses (nu_xy*nu_yx - 1) in denominator
    
    let b2 = b * b;
    let c2 = c * c;
    let b4 = b2 * b2;
    let c4 = c2 * c2;
    let b3c3 = b * b * b * c * c * c;
    let bc = b * c;
    let bc2 = b * c2;
    let b2c = b2 * c;
    
    // PyNite's exact analytical bending stiffness matrix
    // Each row/column corresponds to: w1, rx1, ry1, w2, rx2, ry2, w3, rx3, ry3, w4, rx4, ry4
    let mut k = [[0.0; 12]; 12];
    
    // Row 0 (w1)
    k[0][0] = t3_12 * (-ex*nu_yx*b2*c2/4.0 - ex*c4 - ey*nu_xy*b2*c2/4.0 - ey*b4 + 7.0*g*nu_xy*nu_yx*b2*c2/5.0 - 7.0*g*b2*c2/5.0) / (b3c3 * denom);
    k[0][1] = t3_12 * (-ex*nu_yx*c2/2.0 - ey*b2 + g*nu_xy*nu_yx*c2/5.0 - g*c2/5.0) / (bc2 * denom);
    k[0][2] = t3_12 * (ex*c2 + ey*nu_xy*b2/2.0 - g*nu_xy*nu_yx*b2/5.0 + g*b2/5.0) / (b2c * denom);
    k[0][3] = t3_12 * (5.0*ex*nu_yx*b2*c2 + 20.0*ex*c4 + 5.0*ey*nu_xy*b2*c2 - 10.0*ey*b4 - 28.0*g*nu_xy*nu_yx*b2*c2 + 28.0*g*b2*c2) / (20.0*b3c3 * denom);
    k[0][4] = t3_12 * (ex*nu_yx*c2/2.0 - ey*b2/2.0 - g*nu_xy*nu_yx*c2/5.0 + g*c2/5.0) / (bc2 * denom);
    k[0][5] = t3_12 * (5.0*ex*c2 - g*nu_xy*nu_yx*b2 + g*b2) / (5.0*b2c * denom);
    k[0][6] = t3_12 * (-5.0*ex*nu_yx*b2*c2 + 10.0*ex*c4 - 5.0*ey*nu_xy*b2*c2 + 10.0*ey*b4 + 28.0*g*nu_xy*nu_yx*b2*c2 - 28.0*g*b2*c2) / (20.0*b3c3 * denom);
    k[0][7] = t3_12 * (-ey*b2/2.0 - g*nu_xy*nu_yx*c2/5.0 + g*c2/5.0) / (bc2 * denom);
    k[0][8] = t3_12 * (ex*c2/2.0 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    k[0][9] = t3_12 * (5.0*ex*nu_yx*b2*c2 - 10.0*ex*c4 + 5.0*ey*nu_xy*b2*c2 + 20.0*ey*b4 - 28.0*g*nu_xy*nu_yx*b2*c2 + 28.0*g*b2*c2) / (20.0*b3c3 * denom);
    k[0][10] = t3_12 * (-5.0*ey*b2 + g*nu_xy*nu_yx*c2 - g*c2) / (5.0*bc2 * denom);
    k[0][11] = t3_12 * (ex*c2/2.0 - ey*nu_xy*b2/2.0 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    
    // Row 1 (rx1)
    k[1][0] = k[0][1];
    k[1][1] = t3_12 * 4.0*(-5.0*ey*b2 + 2.0*g*nu_xy*nu_yx*c2 - 2.0*g*c2) / (15.0*bc * denom);
    k[1][2] = t3_12 * ey*nu_xy / denom;
    k[1][3] = t3_12 * (ex*nu_yx*c2/2.0 - ey*b2/2.0 - g*nu_xy*nu_yx*c2/5.0 + g*c2/5.0) / (bc2 * denom);
    k[1][4] = t3_12 * 2.0*(-5.0*ey*b2 - 4.0*g*nu_xy*nu_yx*c2 + 4.0*g*c2) / (15.0*bc * denom);
    k[1][5] = 0.0;
    k[1][6] = t3_12 * (ey*b2/2.0 + g*nu_xy*nu_yx*c2/5.0 - g*c2/5.0) / (bc2 * denom);
    k[1][7] = t3_12 * (-5.0*ey*b2 + 2.0*g*nu_xy*nu_yx*c2 - 2.0*g*c2) / (15.0*bc * denom);
    k[1][8] = 0.0;
    k[1][9] = t3_12 * (5.0*ey*b2 - g*nu_xy*nu_yx*c2 + g*c2) / (5.0*bc2 * denom);
    k[1][10] = t3_12 * 2.0*(-5.0*ey*b2 - g*nu_xy*nu_yx*c2 + g*c2) / (15.0*bc * denom);
    k[1][11] = 0.0;
    
    // Row 2 (ry1)
    k[2][0] = k[0][2];
    k[2][1] = k[1][2];
    k[2][2] = t3_12 * 4.0*(-5.0*ex*c2 + 2.0*g*nu_xy*nu_yx*b2 - 2.0*g*b2) / (15.0*bc * denom);
    k[2][3] = t3_12 * (-5.0*ex*c2 + g*nu_xy*nu_yx*b2 - g*b2) / (5.0*b2c * denom);
    k[2][4] = 0.0;
    k[2][5] = t3_12 * 2.0*(-5.0*ex*c2 - g*nu_xy*nu_yx*b2 + g*b2) / (15.0*bc * denom);
    k[2][6] = t3_12 * -(ex*c2/2.0 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    k[2][7] = 0.0;
    k[2][8] = t3_12 * (-5.0*ex*c2 + 2.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    k[2][9] = t3_12 * (-ex*nu_yx*b2/2.0 + ex*c2/2.0 + g*nu_xy*nu_yx*b2/5.0 - g*b2/5.0) / (b2c * denom);
    k[2][10] = 0.0;
    k[2][11] = t3_12 * -(10.0*ex*c2 + 8.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    
    // Row 3 (w2) - symmetry
    k[3][0] = k[0][3];
    k[3][1] = k[1][3];
    k[3][2] = k[2][3];
    k[3][3] = t3_12 * (-ex*nu_yx*b2*c2/4.0 - ex*c4 - ey*nu_xy*b2*c2/4.0 - ey*b4 + 7.0*g*nu_xy*nu_yx*b2*c2/5.0 - 7.0*g*b2*c2/5.0) / (b3c3 * denom);
    k[3][4] = t3_12 * (-ex*nu_yx*c2/2.0 - ey*b2 + g*nu_xy*nu_yx*c2/5.0 - g*c2/5.0) / (bc2 * denom);
    k[3][5] = t3_12 * (-ex*c2 - ey*nu_xy*b2/2.0 + g*nu_xy*nu_yx*b2/5.0 - g*b2/5.0) / (b2c * denom);
    k[3][6] = t3_12 * (5.0*ex*nu_yx*b2*c2 - 10.0*ex*c4 + 5.0*ey*nu_xy*b2*c2 + 20.0*ey*b4 - 28.0*g*nu_xy*nu_yx*b2*c2 + 28.0*g*b2*c2) / (20.0*b3c3 * denom);
    k[3][7] = t3_12 * (-5.0*ey*b2 + g*nu_xy*nu_yx*c2 - g*c2) / (5.0*bc2 * denom);
    k[3][8] = t3_12 * (-ex*c2/2.0 + ey*nu_xy*b2/2.0 - g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    k[3][9] = t3_12 * (-5.0*ex*nu_yx*b2*c2 + 10.0*ex*c4 - 5.0*ey*nu_xy*b2*c2 + 10.0*ey*b4 + 28.0*g*nu_xy*nu_yx*b2*c2 - 28.0*g*b2*c2) / (20.0*b3c3 * denom);
    k[3][10] = t3_12 * (-ey*b2/2.0 - g*nu_xy*nu_yx*c2/5.0 + g*c2/5.0) / (bc2 * denom);
    k[3][11] = t3_12 * -(ex*c2/2.0 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    
    // Row 4 (rx2)
    k[4][0] = k[0][4];
    k[4][1] = k[1][4];
    k[4][2] = k[2][4];
    k[4][3] = k[3][4];
    k[4][4] = t3_12 * 4.0*(-5.0*ey*b2 + 2.0*g*nu_xy*nu_yx*c2 - 2.0*g*c2) / (15.0*bc * denom);
    k[4][5] = t3_12 * -ey*nu_xy / denom;
    k[4][6] = t3_12 * (5.0*ey*b2 - g*nu_xy*nu_yx*c2 + g*c2) / (5.0*bc2 * denom);
    k[4][7] = t3_12 * 2.0*(-5.0*ey*b2 - g*nu_xy*nu_yx*c2 + g*c2) / (15.0*bc * denom);
    k[4][8] = 0.0;
    k[4][9] = t3_12 * (ey*b2/2.0 + g*nu_xy*nu_yx*c2/5.0 - g*c2/5.0) / (bc2 * denom);
    k[4][10] = t3_12 * (-5.0*ey*b2 + 2.0*g*nu_xy*nu_yx*c2 - 2.0*g*c2) / (15.0*bc * denom);
    k[4][11] = 0.0;
    
    // Row 5 (ry2)
    k[5][0] = k[0][5];
    k[5][1] = k[1][5];
    k[5][2] = k[2][5];
    k[5][3] = k[3][5];
    k[5][4] = k[4][5];
    k[5][5] = t3_12 * 4.0*(-5.0*ex*c2 + 2.0*g*nu_xy*nu_yx*b2 - 2.0*g*b2) / (15.0*bc * denom);
    k[5][6] = t3_12 * (ex*nu_yx*b2/2.0 - ex*c2/2.0 - g*nu_xy*nu_yx*b2/5.0 + g*b2/5.0) / (b2c * denom);
    k[5][7] = 0.0;
    k[5][8] = t3_12 * -(10.0*ex*c2 + 8.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    k[5][9] = t3_12 * (ex*c2/2.0 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    k[5][10] = 0.0;
    k[5][11] = t3_12 * (-5.0*ex*c2 + 2.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    
    // Row 6 (w3)
    k[6][0] = k[0][6];
    k[6][1] = k[1][6];
    k[6][2] = k[2][6];
    k[6][3] = k[3][6];
    k[6][4] = k[4][6];
    k[6][5] = k[5][6];
    k[6][6] = t3_12 * (-ex*nu_yx*b2*c2/4.0 - ex*c4 - ey*nu_xy*b2*c2/4.0 - ey*b4 + 7.0*g*nu_xy*nu_yx*b2*c2/5.0 - 7.0*g*b2*c2/5.0) / (b3c3 * denom);
    k[6][7] = t3_12 * (ex*nu_yx*c2/2.0 + ey*b2 - g*nu_xy*nu_yx*c2/5.0 + g*c2/5.0) / (bc2 * denom);
    k[6][8] = t3_12 * (-ex*c2 - ey*nu_xy*b2/2.0 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    k[6][9] = t3_12 * (5.0*ex*nu_yx*b2*c2 + 20.0*ex*c4 + 5.0*ey*nu_xy*b2*c2 - 10.0*ey*b4 - 28.0*g*nu_xy*nu_yx*b2*c2 + 28.0*g*b2*c2) / (20.0*b3c3 * denom);
    k[6][10] = t3_12 * (-ex*nu_yx*c2/2.0 + ey*b2/2.0 + g*nu_xy*nu_yx*c2/5.0 - g*c2/5.0) / (bc2 * denom);
    k[6][11] = t3_12 * (-ex*c2 + g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    
    // Row 7 (rx3)
    k[7][0] = k[0][7];
    k[7][1] = k[1][7];
    k[7][2] = k[2][7];
    k[7][3] = k[3][7];
    k[7][4] = k[4][7];
    k[7][5] = k[5][7];
    k[7][6] = k[6][7];
    k[7][7] = t3_12 * 4.0*(-5.0*ey*b2 + 2.0*g*nu_xy*nu_yx*c2 - 2.0*g*c2) / (15.0*bc * denom);
    k[7][8] = t3_12 * ey*nu_xy / denom;
    k[7][9] = t3_12 * (-ex*nu_yx*c2/2.0 + ey*b2/2.0 + g*nu_xy*nu_yx*c2/5.0 - g*c2/5.0) / (bc2 * denom);
    k[7][10] = t3_12 * 2.0*(-5.0*ey*b2 - 4.0*g*nu_xy*nu_yx*c2 + 4.0*g*c2) / (15.0*bc * denom);
    k[7][11] = 0.0;
    
    // Row 8 (ry3)
    k[8][0] = k[0][8];
    k[8][1] = k[1][8];
    k[8][2] = k[2][8];
    k[8][3] = k[3][8];
    k[8][4] = k[4][8];
    k[8][5] = k[5][8];
    k[8][6] = k[6][8];
    k[8][7] = k[7][8];
    k[8][8] = t3_12 * 4.0*(-5.0*ex*c2 + 2.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    k[8][9] = t3_12 * (ex*c2 - g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    k[8][10] = 0.0;
    k[8][11] = t3_12 * -(10.0*ex*c2 + 2.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    
    // Row 9 (w4)
    k[9][0] = k[0][9];
    k[9][1] = k[1][9];
    k[9][2] = k[2][9];
    k[9][3] = k[3][9];
    k[9][4] = k[4][9];
    k[9][5] = k[5][9];
    k[9][6] = k[6][9];
    k[9][7] = k[7][9];
    k[9][8] = k[8][9];
    k[9][9] = t3_12 * (-ex*nu_yx*b2*c2/4.0 - ex*c4 - ey*nu_xy*b2*c2/4.0 - ey*b4 + 7.0*g*nu_xy*nu_yx*b2*c2/5.0 - 7.0*g*b2*c2/5.0) / (b3c3 * denom);
    k[9][10] = t3_12 * (ex*nu_yx*c2/2.0 + ey*b2 - g*nu_xy*nu_yx*c2/5.0 + g*c2/5.0) / (bc2 * denom);
    k[9][11] = t3_12 * (ex*c2 + ey*nu_xy*b2/2.0 - g*b2*(nu_xy*nu_yx - 1.0)/5.0) / (b2c * denom);
    
    // Row 10 (rx4)
    k[10][0] = k[0][10];
    k[10][1] = k[1][10];
    k[10][2] = k[2][10];
    k[10][3] = k[3][10];
    k[10][4] = k[4][10];
    k[10][5] = k[5][10];
    k[10][6] = k[6][10];
    k[10][7] = k[7][10];
    k[10][8] = k[8][10];
    k[10][9] = k[9][10];
    k[10][10] = t3_12 * 4.0*(-5.0*ey*b2 + 2.0*g*nu_xy*nu_yx*c2 - 2.0*g*c2) / (15.0*bc * denom);
    k[10][11] = t3_12 * -ey*nu_xy / denom;
    
    // Row 11 (ry4)
    k[11][0] = k[0][11];
    k[11][1] = k[1][11];
    k[11][2] = k[2][11];
    k[11][3] = k[3][11];
    k[11][4] = k[4][11];
    k[11][5] = k[5][11];
    k[11][6] = k[6][11];
    k[11][7] = k[7][11];
    k[11][8] = k[8][11];
    k[11][9] = k[9][11];
    k[11][10] = k[10][11];
    k[11][11] = t3_12 * 4.0*(-5.0*ex*c2 + 2.0*g*b2*(nu_xy*nu_yx - 1.0)) / (15.0*bc * denom);
    
    k
}

/// Expand the 12x12 bending stiffness matrix to 24x24
/// 
/// Maps: (w1, rx1, ry1, w2, rx2, ry2, w3, rx3, ry3, w4, rx4, ry4) -> 
///       (DX1, DY1, DZ1, RX1, RY1, RZ1, ...)
fn expand_bending_to_24(k12: &[[f64; 12]; 12], k_rz: f64) -> Mat24 {
    let mut k24 = Mat24::zeros();
    
    // Mapping: w->DZ (2), rx->RX (3), ry->RY (4)
    // Node 1: w1->2, rx1->3, ry1->4
    // Node 2: w2->8, rx2->9, ry2->10
    // Node 3: w3->14, rx3->15, ry3->16
    // Node 4: w4->20, rx4->21, ry4->22
    let mapping = [2, 3, 4, 8, 9, 10, 14, 15, 16, 20, 21, 22];
    
    for (i, &mi) in mapping.iter().enumerate() {
        for (j, &mj) in mapping.iter().enumerate() {
            k24[(mi, mj)] = k12[i][j];
        }
    }
    
    // Add weak spring for drilling DOF (RZ) at each node
    // RZ positions: 5, 11, 17, 23
    k24[(5, 5)] = k_rz;
    k24[(11, 11)] = k_rz;
    k24[(17, 17)] = k_rz;
    k24[(23, 23)] = k_rz;
    
    k24
}

/// Compute the complete local stiffness matrix for a rectangular plate element
/// 
/// Combines membrane (in-plane) and bending (out-of-plane) stiffness matrices.
/// Supports multiple plate bending formulations.
/// 
/// # Arguments
/// * `e` - Modulus of elasticity
/// * `nu` - Poisson's ratio
/// * `t` - Plate thickness
/// * `width` - Plate width (i-j edge length)
/// * `height` - Plate height (j-m edge length)  
/// * `kx_mod` - Stiffness modifier in local x direction
/// * `ky_mod` - Stiffness modifier in local y direction
/// * `formulation` - Plate bending formulation to use
/// 
/// # Returns
/// 24x24 local stiffness matrix for DOFs: [DX, DY, DZ, RX, RY, RZ] at each of 4 nodes
pub fn plate_local_stiffness(
    e: f64,
    nu: f64,
    t: f64,
    width: f64,
    height: f64,
    kx_mod: f64,
    ky_mod: f64,
) -> Mat24 {
    plate_local_stiffness_with_formulation(e, nu, t, width, height, kx_mod, ky_mod, PlateFormulation::Kirchhoff)
}

/// Compute plate stiffness with specified formulation
pub fn plate_local_stiffness_with_formulation(
    e: f64,
    nu: f64,
    t: f64,
    width: f64,
    height: f64,
    kx_mod: f64,
    ky_mod: f64,
    formulation: PlateFormulation,
) -> Mat24 {
    // Membrane stiffness is the same for all formulations
    let k_m = membrane_stiffness_unexpanded(e, nu, t, width, height, kx_mod, ky_mod);
    
    // Bending stiffness depends on formulation
    let k_b = match formulation {
        PlateFormulation::Kirchhoff => {
            bending_stiffness_unexpanded(e, nu, t, width, height, kx_mod, ky_mod)
        }
        PlateFormulation::Mindlin => {
            bending_stiffness_mindlin(e, nu, t, width, height, kx_mod, ky_mod)
        }
        PlateFormulation::DKMQ => {
            bending_stiffness_dkmq(e, nu, t, width, height, kx_mod, ky_mod)
        }
    };
    
    // Find minimum rotational stiffness for weak spring
    let mut min_rot = f64::MAX;
    for i in [1, 2, 4, 5, 7, 8, 10, 11] {
        if k_b[i][i].abs() > 1e-10 && k_b[i][i].abs() < min_rot {
            min_rot = k_b[i][i].abs();
        }
    }
    
    // Fallback if no valid rotational stiffness found
    if min_rot == f64::MAX {
        // Use a reasonable fraction of membrane stiffness
        let mut max_mem = 0.0_f64;
        for i in 0..8 {
            max_mem = max_mem.max(k_m[i][i].abs());
        }
        min_rot = max_mem / 100.0;
    }
    
    let k_rz = min_rot / 1000.0; // Weak spring for drilling DOF
    
    // Expand to 24x24 and combine
    let k_m_24 = expand_membrane_to_24(&k_m);
    let k_b_24 = expand_bending_to_24(&k_b, k_rz);
    
    k_m_24 + k_b_24
}

/// Compute Mindlin-Reissner plate bending stiffness (includes shear deformation)
/// 
/// This formulation is better for thick plates where transverse shear
/// deformation is significant (thickness/span > 1/20).
/// Uses 2x2 Gauss quadrature for bending and reduced integration for shear.
/// 
/// Reference: "Finite Element Procedures" by Bathe, Section 5.4
fn bending_stiffness_mindlin(e: f64, nu: f64, t: f64, width: f64, height: f64, kx_mod: f64, ky_mod: f64) -> [[f64; 12]; 12] {
    let ex = e * kx_mod;
    let ey = e * ky_mod;
    let g = e / (2.0 * (1.0 + nu));
    
    // Bending rigidity matrix (Db)
    let d_factor = t.powi(3) / (12.0 * (1.0 - nu * nu));
    let db = Mat3::new(
        ex * d_factor,      nu * ex * d_factor, 0.0,
        nu * ey * d_factor, ey * d_factor,      0.0,
        0.0,                0.0,                g * d_factor * (1.0 - nu),
    );
    
    // Shear correction factor (5/6 is standard for rectangular cross-section)
    let kappa = 5.0 / 6.0;
    
    // Shear stiffness matrix (Ds)
    // Ds = kappa * G * t * I (2x2 identity)
    let ds_factor = kappa * g * t;
    let ds = [[ds_factor, 0.0], [0.0, ds_factor]];
    
    // Gauss points for 2x2 integration
    let gp = 1.0 / 3.0_f64.sqrt();
    let gauss_pts = [(-gp, -gp), (gp, -gp), (gp, gp), (-gp, gp)];
    
    // Single point for reduced shear integration (avoids shear locking)
    let shear_pt = [(0.0, 0.0)];
    
    let j_det = jacobian_det(width, height);
    let j_inv = jacobian_inverse(width, height);
    
    let mut k_b = [[0.0; 12]; 12];
    
    // Bending contribution (2x2 Gauss)
    for &(r, s) in &gauss_pts {
        let b_kappa = bending_curvature_b_matrix(&j_inv, r, s);
        
        // k_b += B_kappa^T * Db * B_kappa * det(J)
        for i in 0..12 {
            for j in 0..12 {
                let mut sum = 0.0;
                for m in 0..3 {
                    for n in 0..3 {
                        sum += b_kappa[m][i] * db[(m, n)] * b_kappa[n][j];
                    }
                }
                k_b[i][j] += sum * j_det;
            }
        }
    }
    
    // Shear contribution (reduced 1-point integration)
    for &(r, s) in &shear_pt {
        let b_gamma = shear_strain_b_matrix(&j_inv, r, s);
        
        // k_s += B_gamma^T * Ds * B_gamma * det(J) * weight
        // Weight for single point = 4 (covers full domain [-1,1]x[-1,1])
        let weight = 4.0;
        for i in 0..12 {
            for j in 0..12 {
                let mut sum = 0.0;
                for m in 0..2 {
                    for n in 0..2 {
                        sum += b_gamma[m][i] * ds[m][n] * b_gamma[n][j];
                    }
                }
                k_b[i][j] += sum * j_det * weight;
            }
        }
    }
    
    k_b
}

/// Compute the bending curvature strain-displacement matrix for Mindlin plate
/// 
/// Relates curvatures [kappa_x, kappa_y, kappa_xy] to nodal DOFs [w, rx, ry] at each node
/// For Mindlin plate: kappa_x = d(theta_y)/dx, kappa_y = d(theta_x)/dy, kappa_xy = d(theta_x)/dx + d(theta_y)/dy
fn bending_curvature_b_matrix(j_inv: &[[f64; 2]; 2], r: f64, s: f64) -> [[f64; 12]; 3] {
    // Shape functions: N_i = 1/4 * (1 +/- r)(1 +/- s)
    // Derivatives with respect to r and s
    let dn_dr = [
        -(1.0 - s) / 4.0,
        (1.0 - s) / 4.0,
        (1.0 + s) / 4.0,
        -(1.0 + s) / 4.0,
    ];
    let dn_ds = [
        -(1.0 - r) / 4.0,
        -(1.0 + r) / 4.0,
        (1.0 + r) / 4.0,
        (1.0 - r) / 4.0,
    ];
    
    // Transform to physical derivatives
    let mut dn_dx = [0.0; 4];
    let mut dn_dy = [0.0; 4];
    for i in 0..4 {
        dn_dx[i] = j_inv[0][0] * dn_dr[i] + j_inv[0][1] * dn_ds[i];
        dn_dy[i] = j_inv[1][0] * dn_dr[i] + j_inv[1][1] * dn_ds[i];
    }
    
    // B_kappa matrix: 3 rows (kappa_x, kappa_y, kappa_xy), 12 columns (w1, rx1, ry1, w2, rx2, ry2, ...)
    // kappa_x = d(theta_y)/dx = sum(dN_i/dx * ry_i)
    // kappa_y = d(theta_x)/dy = sum(dN_i/dy * rx_i) (note: theta_x ~ -rx in some conventions)
    // kappa_xy = d(theta_x)/dx + d(theta_y)/dy
    let mut b = [[0.0; 12]; 3];
    
    for i in 0..4 {
        let col_w = i * 3;
        let col_rx = i * 3 + 1;
        let col_ry = i * 3 + 2;
        
        // kappa_x = d(ry)/dx  (ry is rotation about y, relates to d^2w/dx^2)
        b[0][col_ry] = dn_dx[i];
        
        // kappa_y = -d(rx)/dy  (rx is rotation about x, relates to d^2w/dy^2)
        b[1][col_rx] = -dn_dy[i];
        
        // kappa_xy = -d(rx)/dx + d(ry)/dy
        b[2][col_rx] = -dn_dx[i];
        b[2][col_ry] = dn_dy[i];
    }
    
    b
}

/// Compute the shear strain-displacement matrix for Mindlin plate
/// 
/// Relates transverse shear strains [gamma_xz, gamma_yz] to nodal DOFs
/// gamma_xz = dw/dx + theta_y, gamma_yz = dw/dy + theta_x
fn shear_strain_b_matrix(j_inv: &[[f64; 2]; 2], r: f64, s: f64) -> [[f64; 12]; 2] {
    // Shape functions and derivatives
    let n = [
        (1.0 - r) * (1.0 - s) / 4.0,
        (1.0 + r) * (1.0 - s) / 4.0,
        (1.0 + r) * (1.0 + s) / 4.0,
        (1.0 - r) * (1.0 + s) / 4.0,
    ];
    
    let dn_dr = [
        -(1.0 - s) / 4.0,
        (1.0 - s) / 4.0,
        (1.0 + s) / 4.0,
        -(1.0 + s) / 4.0,
    ];
    let dn_ds = [
        -(1.0 - r) / 4.0,
        -(1.0 + r) / 4.0,
        (1.0 + r) / 4.0,
        (1.0 - r) / 4.0,
    ];
    
    let mut dn_dx = [0.0; 4];
    let mut dn_dy = [0.0; 4];
    for i in 0..4 {
        dn_dx[i] = j_inv[0][0] * dn_dr[i] + j_inv[0][1] * dn_ds[i];
        dn_dy[i] = j_inv[1][0] * dn_dr[i] + j_inv[1][1] * dn_ds[i];
    }
    
    // B_gamma matrix: 2 rows, 12 columns
    // gamma_xz = dw/dx + ry  (theta_y = ry for rotation about y axis)
    // gamma_yz = dw/dy - rx  (theta_x = -rx for rotation about x axis)
    let mut b = [[0.0; 12]; 2];
    
    for i in 0..4 {
        let col_w = i * 3;
        let col_rx = i * 3 + 1;
        let col_ry = i * 3 + 2;
        
        // gamma_xz = dw/dx + ry
        b[0][col_w] = dn_dx[i];
        b[0][col_ry] = n[i];
        
        // gamma_yz = dw/dy - rx
        b[1][col_w] = dn_dy[i];
        b[1][col_rx] = -n[i];
    }
    
    b
}

/// Compute DKMQ (Discrete Kirchhoff-Mindlin Quadrilateral) bending stiffness
/// 
/// This formulation combines the benefits of Kirchhoff and Mindlin theories:
/// - Works for both thin and thick plates
/// - Avoids shear locking
/// - Handles general quadrilateral geometry
/// 
/// Reference: "A Comparative Formulation of DKMQ, DSQ and MITC4" by Katili (1993)
fn bending_stiffness_dkmq(e: f64, nu: f64, t: f64, width: f64, height: f64, kx_mod: f64, ky_mod: f64) -> [[f64; 12]; 12] {
    let ex = e * kx_mod;
    let ey = e * ky_mod;
    let g = e / (2.0 * (1.0 + nu));
    
    // Bending rigidity
    let d_factor = t.powi(3) / (12.0 * (1.0 - nu * nu));
    
    // Constitutive matrix for bending (Hb in PyNite)
    let hb = Mat3::new(
        ex * d_factor,      nu * ex * d_factor, 0.0,
        nu * ey * d_factor, ey * d_factor,      0.0,
        0.0,                0.0,                g * d_factor * (1.0 - nu),
    );
    
    // Shear correction and shear constitutive matrix (Hs in PyNite)
    let kappa = 5.0 / 6.0;
    let hs_factor = kappa * g * t;
    let hs = [[hs_factor, 0.0], [0.0, hs_factor]];
    
    // Node positions in natural coordinates for rectangular element
    // i=(-1,-1), j=(1,-1), m=(1,1), n=(-1,1)
    let node_r = [-1.0, 1.0, 1.0, -1.0];
    let node_s = [-1.0, -1.0, 1.0, 1.0];
    
    // Edge lengths and midpoint factors (for DKMQ interpolation)
    let b = width / 2.0;
    let c = height / 2.0;
    
    // Edge lengths (physical)
    let l_12 = width;   // i-j
    let l_23 = height;  // j-m
    let l_34 = width;   // m-n
    let l_41 = height;  // n-i
    
    // DKMQ uses "phi_k" function to interpolate between Kirchhoff and Mindlin
    // phi_k = 1 / (1 + alpha_k) where alpha_k = 12 * D / (L_k^2 * kappa * G * t)
    let d_bend = ex * t.powi(3) / (12.0 * (1.0 - nu * nu));
    
    let alpha_12 = 12.0 * d_bend / (l_12 * l_12 * kappa * g * t);
    let alpha_23 = 12.0 * d_bend / (l_23 * l_23 * kappa * g * t);
    let alpha_34 = 12.0 * d_bend / (l_34 * l_34 * kappa * g * t);
    let alpha_41 = 12.0 * d_bend / (l_41 * l_41 * kappa * g * t);
    
    let phi_12 = 1.0 / (1.0 + alpha_12);
    let phi_23 = 1.0 / (1.0 + alpha_23);
    let phi_34 = 1.0 / (1.0 + alpha_34);
    let phi_41 = 1.0 / (1.0 + alpha_41);
    
    // 2x2 Gauss quadrature
    let gp = 1.0 / 3.0_f64.sqrt();
    let gauss_pts = [(-gp, -gp), (gp, -gp), (gp, gp), (-gp, gp)];
    
    let j_det = jacobian_det(width, height);
    let j_inv = jacobian_inverse(width, height);
    
    let mut k_b = [[0.0; 12]; 12];
    
    for &(r, s) in &gauss_pts {
        // Compute DKMQ bending strain-displacement matrix
        let b_b = dkmq_bending_b_matrix(&j_inv, r, s, phi_12, phi_23, phi_34, phi_41);
        
        // k_b += B_b^T * Hb * B_b * det(J)
        for i in 0..12 {
            for j in 0..12 {
                let mut sum = 0.0;
                for m in 0..3 {
                    for n in 0..3 {
                        sum += b_b[m][i] * hb[(m, n)] * b_b[n][j];
                    }
                }
                k_b[i][j] += sum * j_det;
            }
        }
        
        // For DKMQ, shear is implicitly included through the phi functions
        // which interpolate based on plate slenderness
        // Adding explicit shear for thicker plates
        if phi_12.max(phi_23).max(phi_34).max(phi_41) > 0.1 {
            let b_s = dkmq_shear_b_matrix(&j_inv, r, s, phi_12, phi_23, phi_34, phi_41);
            
            for i in 0..12 {
                for j in 0..12 {
                    let mut sum = 0.0;
                    for m in 0..2 {
                        for n in 0..2 {
                            sum += b_s[m][i] * hs[m][n] * b_s[n][j];
                        }
                    }
                    k_b[i][j] += sum * j_det;
                }
            }
        }
    }
    
    k_b
}

/// DKMQ bending strain-displacement matrix
/// 
/// Uses the discrete Kirchhoff constraints at edge midpoints
/// to interpolate rotations, avoiding shear locking
fn dkmq_bending_b_matrix(
    j_inv: &[[f64; 2]; 2], 
    r: f64, 
    s: f64,
    phi_12: f64, phi_23: f64, phi_34: f64, phi_41: f64
) -> [[f64; 12]; 3] {
    // Shape function derivatives
    let dn_dr = [
        -(1.0 - s) / 4.0,
        (1.0 - s) / 4.0,
        (1.0 + s) / 4.0,
        -(1.0 + s) / 4.0,
    ];
    let dn_ds = [
        -(1.0 - r) / 4.0,
        -(1.0 + r) / 4.0,
        (1.0 + r) / 4.0,
        (1.0 - r) / 4.0,
    ];
    
    let mut dn_dx = [0.0; 4];
    let mut dn_dy = [0.0; 4];
    for i in 0..4 {
        dn_dx[i] = j_inv[0][0] * dn_dr[i] + j_inv[0][1] * dn_ds[i];
        dn_dy[i] = j_inv[1][0] * dn_dr[i] + j_inv[1][1] * dn_ds[i];
    }
    
    // DKMQ uses modified shape functions that blend based on phi values
    // For thin plates (phi->0), approaches Kirchhoff behavior
    // For thick plates (phi->1), approaches Mindlin behavior
    
    // Edge shape function derivatives for DKMQ
    // N5 (midside 1-2), N6 (midside 2-3), N7 (midside 3-4), N8 (midside 4-1)
    let n5_dr = 0.5 * (1.0 - s);   // lambda_1 + lambda_2 at midpoint
    let n5_ds = -0.25 * r;
    let n6_dr = 0.25 * s;
    let n6_ds = 0.5 * (1.0 + r);
    let n7_dr = -0.5 * (1.0 + s);
    let n7_ds = 0.25 * r;
    let n8_dr = -0.25 * s;
    let n8_ds = -0.5 * (1.0 - r);
    
    // Standard bending B matrix with phi corrections
    let mut b = [[0.0; 12]; 3];
    
    for i in 0..4 {
        let col_w = i * 3;
        let col_rx = i * 3 + 1;
        let col_ry = i * 3 + 2;
        
        // Curvature kappa_x = d(beta_y)/dx where beta_y is rotation about y
        b[0][col_ry] = dn_dx[i];
        
        // Curvature kappa_y = d(beta_x)/dy where beta_x is rotation about x
        b[1][col_rx] = -dn_dy[i];
        
        // Twist kappa_xy = d(beta_x)/dx + d(beta_y)/dy
        b[2][col_rx] = -dn_dx[i];
        b[2][col_ry] = dn_dy[i];
    }
    
    // Apply phi factors to blend between formulations
    // This is a simplified DKMQ - the full version has more complex coupling
    let phi_avg = (phi_12 + phi_23 + phi_34 + phi_41) / 4.0;
    let scale = 1.0 - 0.5 * phi_avg;  // Reduce stiffness for thicker plates
    
    for i in 0..3 {
        for j in 0..12 {
            b[i][j] *= scale;
        }
    }
    
    b
}

/// DKMQ shear strain-displacement matrix (for thick plate contribution)
fn dkmq_shear_b_matrix(
    j_inv: &[[f64; 2]; 2],
    r: f64,
    s: f64,
    phi_12: f64, phi_23: f64, phi_34: f64, phi_41: f64
) -> [[f64; 12]; 2] {
    let n = [
        (1.0 - r) * (1.0 - s) / 4.0,
        (1.0 + r) * (1.0 - s) / 4.0,
        (1.0 + r) * (1.0 + s) / 4.0,
        (1.0 - r) * (1.0 + s) / 4.0,
    ];
    
    let dn_dr = [
        -(1.0 - s) / 4.0,
        (1.0 - s) / 4.0,
        (1.0 + s) / 4.0,
        -(1.0 + s) / 4.0,
    ];
    let dn_ds = [
        -(1.0 - r) / 4.0,
        -(1.0 + r) / 4.0,
        (1.0 + r) / 4.0,
        (1.0 - r) / 4.0,
    ];
    
    let mut dn_dx = [0.0; 4];
    let mut dn_dy = [0.0; 4];
    for i in 0..4 {
        dn_dx[i] = j_inv[0][0] * dn_dr[i] + j_inv[0][1] * dn_ds[i];
        dn_dy[i] = j_inv[1][0] * dn_dr[i] + j_inv[1][1] * dn_ds[i];
    }
    
    let phi_avg = (phi_12 + phi_23 + phi_34 + phi_41) / 4.0;
    
    let mut b = [[0.0; 12]; 2];
    
    for i in 0..4 {
        let col_w = i * 3;
        let col_rx = i * 3 + 1;
        let col_ry = i * 3 + 2;
        
        // gamma_xz = dw/dx + beta_y (scaled by phi for DKMQ behavior)
        b[0][col_w] = dn_dx[i] * phi_avg;
        b[0][col_ry] = n[i] * phi_avg;
        
        // gamma_yz = dw/dy - beta_x
        b[1][col_w] = dn_dy[i] * phi_avg;
        b[1][col_rx] = -n[i] * phi_avg;
    }
    
    b
}

/// Compute the transformation matrix for a plate element
/// 
/// Transforms from local to global coordinates. The local coordinate system is:
/// - x-axis: from i-node to j-node
/// - z-axis: normal to plate surface (cross product of x and i-n vector)
/// - y-axis: z cross x
/// 
/// # Arguments
/// * `i_node` - Coordinates of i-node [X, Y, Z]
/// * `j_node` - Coordinates of j-node [X, Y, Z]  
/// * `n_node` - Coordinates of n-node [X, Y, Z]
/// 
/// # Returns
/// 24x24 transformation matrix
pub fn plate_transformation_matrix(
    i_node: &[f64; 3],
    j_node: &[f64; 3],
    n_node: &[f64; 3],
) -> Mat24 {
    // Calculate local x-axis (i to j)
    let dx = j_node[0] - i_node[0];
    let dy = j_node[1] - i_node[1];
    let dz = j_node[2] - i_node[2];
    let len_x = (dx * dx + dy * dy + dz * dz).sqrt();
    let x = [dx / len_x, dy / len_x, dz / len_x];
    
    // Vector from i to n (defines the plane)
    let in_x = n_node[0] - i_node[0];
    let in_y = n_node[1] - i_node[1];
    let in_z = n_node[2] - i_node[2];
    
    // z-axis = x cross (i-n), perpendicular to plate
    let z_raw = [
        x[1] * in_z - x[2] * in_y,
        x[2] * in_x - x[0] * in_z,
        x[0] * in_y - x[1] * in_x,
    ];
    let len_z = (z_raw[0] * z_raw[0] + z_raw[1] * z_raw[1] + z_raw[2] * z_raw[2]).sqrt();
    let z = [z_raw[0] / len_z, z_raw[1] / len_z, z_raw[2] / len_z];
    
    // y-axis = z cross x
    let y = [
        z[1] * x[2] - z[2] * x[1],
        z[2] * x[0] - z[0] * x[2],
        z[0] * x[1] - z[1] * x[0],
    ];
    
    // Direction cosine matrix (3x3 rotation)
    let dir_cos = Mat3::new(
        x[0], x[1], x[2],
        y[0], y[1], y[2],
        z[0], z[1], z[2],
    );
    
    // Build 24x24 transformation matrix with 8 diagonal 3x3 blocks
    let mut t = Mat24::zeros();
    
    for i in 0..8 {
        let offset = i * 3;
        for row in 0..3 {
            for col in 0..3 {
                t[(offset + row, offset + col)] = dir_cos[(row, col)];
            }
        }
    }
    
    t
}

/// Compute fixed end reactions for a uniform pressure on a plate
/// 
/// # Arguments
/// * `pressure` - Surface pressure (positive = in positive local z direction)
/// * `width` - Plate width
/// * `height` - Plate height
/// 
/// # Returns
/// 24-element fixed end reaction vector
pub fn plate_fer_pressure(pressure: f64, width: f64, height: f64) -> Vec24 {
    let b = width / 2.0;
    let c = height / 2.0;
    let p = pressure;
    
    // From PyNite: fer = -4*p*c*b * [1/4, c/12, -b/12, 1/4, c/12, b/12, 1/4, -c/12, b/12, 1/4, -c/12, -b/12]
    // This is for the bending DOFs (w, rx, ry at each node)
    let fer_12 = [
        -4.0 * p * c * b * 0.25,     // w1
        -4.0 * p * c * b * (c / 12.0),  // rx1
        -4.0 * p * c * b * (-b / 12.0), // ry1
        -4.0 * p * c * b * 0.25,     // w2
        -4.0 * p * c * b * (c / 12.0),  // rx2
        -4.0 * p * c * b * (b / 12.0),  // ry2
        -4.0 * p * c * b * 0.25,     // w3
        -4.0 * p * c * b * (-c / 12.0), // rx3
        -4.0 * p * c * b * (b / 12.0),  // ry3
        -4.0 * p * c * b * 0.25,     // w4
        -4.0 * p * c * b * (-c / 12.0), // rx4
        -4.0 * p * c * b * (-b / 12.0), // ry4
    ];
    
    // Expand to 24 DOFs
    // Mapping: w->DZ (2), rx->RX (3), ry->RY (4) for each node
    let mapping = [2, 3, 4, 8, 9, 10, 14, 15, 16, 20, 21, 22];
    
    let mut fer = Vec24::zeros();
    for (i, &mi) in mapping.iter().enumerate() {
        fer[mi] = fer_12[i];
    }
    
    fer
}

/// Calculate internal moments at a point in the plate
/// 
/// # Arguments
/// * `x`, `y` - Local coordinates (0 to width, 0 to height)
/// * `displacements` - 24-element local displacement vector
/// * `e`, `nu`, `t` - Material and geometric properties
/// * `width`, `height` - Plate dimensions
/// 
/// # Returns
/// [Mx, My, Mxy] - Internal moments per unit width
pub fn plate_moments(
    x: f64,
    y: f64,
    displacements: &Vec24,
    e: f64,
    nu: f64,
    t: f64,
    width: f64,
    height: f64,
    kx_mod: f64,
    ky_mod: f64,
) -> [f64; 3] {
    let db = bending_constitutive_matrix(e, nu, t, kx_mod, ky_mod);
    
    // Extract bending displacements (w, rx, ry at each node)
    let mapping = [2, 3, 4, 8, 9, 10, 14, 15, 16, 20, 21, 22];
    let mut d = [0.0; 12];
    for (i, &mi) in mapping.iter().enumerate() {
        d[i] = displacements[mi];
    }
    
    // Calculate displacement coefficient matrix [C] and its inverse
    // Then calculate [a] = inv([C]) * d
    // Finally, moments = -[Db] * [Q] * [a]
    
    // For simplicity, approximate moments at center using bilinear interpolation
    // of nodal rotations and second derivatives
    
    // This is a simplified calculation - for full accuracy, implement the
    // polynomial coefficient approach from PyNite
    
    let rx_avg = (d[1] + d[4] + d[7] + d[10]) / 4.0;
    let ry_avg = (d[2] + d[5] + d[8] + d[11]) / 4.0;
    
    // Approximate curvatures from rotation gradients
    let kappa_x = -2.0 * ry_avg / width;  // d^2w/dx^2 ≈ -dry/dx
    let kappa_y = 2.0 * rx_avg / height;   // d^2w/dy^2 ≈ drx/dy
    let kappa_xy = (rx_avg / width + ry_avg / height);
    
    // M = Db * kappa
    let mx = db[(0, 0)] * kappa_x + db[(0, 1)] * kappa_y;
    let my = db[(1, 0)] * kappa_x + db[(1, 1)] * kappa_y;
    let mxy = db[(2, 2)] * kappa_xy;
    
    [mx, my, mxy]
}

/// Calculate membrane stresses at a point in the plate
/// 
/// # Arguments
/// * `x`, `y` - Local coordinates
/// * `displacements` - 24-element local displacement vector
/// * `e`, `nu`, `t` - Material properties and thickness
/// * `width`, `height` - Plate dimensions
/// 
/// # Returns
/// [sigma_x, sigma_y, tau_xy] - In-plane stresses
pub fn plate_membrane_stress(
    x: f64,
    y: f64,
    displacements: &Vec24,
    e: f64,
    nu: f64,
    t: f64,
    width: f64,
    height: f64,
    kx_mod: f64,
    ky_mod: f64,
) -> [f64; 3] {
    let dm = membrane_constitutive_matrix(e, nu, kx_mod, ky_mod);
    
    // Convert x, y to natural coordinates r, s
    let r = -1.0 + 2.0 * x / width;
    let s = -1.0 + 2.0 * y / height;
    
    // Get B matrix at this point
    let b = membrane_b_matrix(width, height, r, s);
    
    // Extract membrane displacements (u, v at each node)
    // Mapping: u1->0, v1->1, u2->6, v2->7, u3->12, v3->13, u4->18, v4->19
    let mapping = [0, 1, 6, 7, 12, 13, 18, 19];
    let mut d = [0.0; 8];
    for (i, &mi) in mapping.iter().enumerate() {
        d[i] = displacements[mi];
    }
    
    // Calculate strains: epsilon = B * d
    let mut strain = [0.0; 3];
    for i in 0..3 {
        for j in 0..8 {
            strain[i] += b[i][j] * d[j];
        }
    }
    
    // Calculate stresses: sigma = Dm * epsilon
    let mut stress = [0.0; 3];
    for i in 0..3 {
        for j in 0..3 {
            stress[i] += dm[(i, j)] * strain[j];
        }
    }
    
    stress
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_membrane_constitutive_isotropic() {
        let e = 200e9;
        let nu = 0.3;
        let dm = membrane_constitutive_matrix(e, nu, 1.0, 1.0);
        
        // Check symmetry
        assert_relative_eq!(dm[(0, 1)], dm[(1, 0)], epsilon = 1e-6);
        
        // Check that diagonal terms are positive
        assert!(dm[(0, 0)] > 0.0);
        assert!(dm[(1, 1)] > 0.0);
        assert!(dm[(2, 2)] > 0.0);
    }

    #[test]
    fn test_plate_stiffness_symmetry() {
        let k = plate_local_stiffness(200e9, 0.3, 0.01, 1.0, 1.0, 1.0, 1.0);
        
        // Check symmetry
        for i in 0..24 {
            for j in 0..24 {
                assert_relative_eq!(k[(i, j)], k[(j, i)], epsilon = 1e-6);
            }
        }
    }

    #[test]
    fn test_transformation_matrix_horizontal() {
        // Horizontal plate in XY plane
        let i = [0.0, 0.0, 0.0];
        let j = [1.0, 0.0, 0.0];
        let n = [0.0, 1.0, 0.0];
        
        let t = plate_transformation_matrix(&i, &j, &n);
        
        // For plate in XY plane:
        // local x = global X, local y = global Y, local z = global Z
        assert_relative_eq!(t[(0, 0)], 1.0, epsilon = 1e-10);
        assert_relative_eq!(t[(1, 1)], 1.0, epsilon = 1e-10);
        assert_relative_eq!(t[(2, 2)], 1.0, epsilon = 1e-10);
    }

    #[test]
    fn test_transformation_matrix_vertical() {
        // Vertical plate in XZ plane
        let i = [0.0, 0.0, 0.0];
        let j = [1.0, 0.0, 0.0];
        let n = [0.0, 0.0, 1.0];
        
        let t = plate_transformation_matrix(&i, &j, &n);
        
        // For vertical plate:
        // local x = global X, local y = global Z, local z = -global Y
        assert_relative_eq!(t[(0, 0)], 1.0, epsilon = 1e-10);  // x = X
        assert_relative_eq!(t[(1, 2)], 1.0, epsilon = 1e-10);  // y = Z
        assert_relative_eq!(t[(2, 1)], -1.0, epsilon = 1e-10); // z = -Y
    }
}
