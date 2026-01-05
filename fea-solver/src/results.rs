//! Result types for FEA analysis

use serde::{Deserialize, Serialize};

/// Displacement results at a node
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct NodeDisplacement {
    /// Displacement in X direction
    pub dx: f64,
    /// Displacement in Y direction
    pub dy: f64,
    /// Displacement in Z direction
    pub dz: f64,
    /// Rotation about X axis
    pub rx: f64,
    /// Rotation about Y axis
    pub ry: f64,
    /// Rotation about Z axis
    pub rz: f64,
}

impl NodeDisplacement {
    /// Create from array [DX, DY, DZ, RX, RY, RZ]
    pub fn from_array(arr: [f64; 6]) -> Self {
        Self {
            dx: arr[0],
            dy: arr[1],
            dz: arr[2],
            rx: arr[3],
            ry: arr[4],
            rz: arr[5],
        }
    }

    /// Get translation magnitude
    pub fn translation_magnitude(&self) -> f64 {
        (self.dx.powi(2) + self.dy.powi(2) + self.dz.powi(2)).sqrt()
    }

    /// Get rotation magnitude
    pub fn rotation_magnitude(&self) -> f64 {
        (self.rx.powi(2) + self.ry.powi(2) + self.rz.powi(2)).sqrt()
    }
}

/// Reaction forces at a supported node
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Reactions {
    /// Reaction force in X direction
    pub fx: f64,
    /// Reaction force in Y direction
    pub fy: f64,
    /// Reaction force in Z direction
    pub fz: f64,
    /// Reaction moment about X axis
    pub mx: f64,
    /// Reaction moment about Y axis
    pub my: f64,
    /// Reaction moment about Z axis
    pub mz: f64,
}

impl Reactions {
    /// Create from array [FX, FY, FZ, MX, MY, MZ]
    pub fn from_array(arr: [f64; 6]) -> Self {
        Self {
            fx: arr[0],
            fy: arr[1],
            fz: arr[2],
            mx: arr[3],
            my: arr[4],
            mz: arr[5],
        }
    }

    /// Get total force magnitude
    pub fn force_magnitude(&self) -> f64 {
        (self.fx.powi(2) + self.fy.powi(2) + self.fz.powi(2)).sqrt()
    }

    /// Get total moment magnitude
    pub fn moment_magnitude(&self) -> f64 {
        (self.mx.powi(2) + self.my.powi(2) + self.mz.powi(2)).sqrt()
    }
}

/// Internal forces in a member
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct MemberForces {
    /// Axial force (positive = tension)
    pub axial: f64,
    /// Shear force in local y direction
    pub shear_y: f64,
    /// Shear force in local z direction
    pub shear_z: f64,
    /// Torsion
    pub torsion: f64,
    /// Bending moment about local y axis
    pub moment_y: f64,
    /// Bending moment about local z axis
    pub moment_z: f64,
}

impl MemberForces {
    /// Create from local force array at i-node
    pub fn from_i_node_forces(forces: &[f64; 12]) -> Self {
        Self {
            axial: -forces[0],
            shear_y: forces[1],
            shear_z: forces[2],
            torsion: -forces[3],
            moment_y: forces[4],
            moment_z: forces[5],
        }
    }

    /// Create from local force array at j-node
    pub fn from_j_node_forces(forces: &[f64; 12]) -> Self {
        Self {
            axial: forces[6],
            shear_y: -forces[7],
            shear_z: -forces[8],
            torsion: forces[9],
            moment_y: forces[10],
            moment_z: forces[11],
        }
    }
}

/// Stress results in a plate/shell element
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PlateStress {
    /// Normal stress in X direction
    pub sx: f64,
    /// Normal stress in Y direction
    pub sy: f64,
    /// Shear stress XY
    pub txy: f64,
    /// Von Mises equivalent stress
    pub von_mises: f64,
    /// Maximum principal stress
    pub s1: f64,
    /// Minimum principal stress
    pub s2: f64,
}

impl PlateStress {
    /// Create from stress components
    pub fn from_components(sx: f64, sy: f64, txy: f64) -> Self {
        let von_mises = (sx.powi(2) - sx * sy + sy.powi(2) + 3.0 * txy.powi(2)).sqrt();
        
        // Principal stresses
        let s_avg = (sx + sy) / 2.0;
        let r = ((sx - sy).powi(2) / 4.0 + txy.powi(2)).sqrt();
        let s1 = s_avg + r;
        let s2 = s_avg - r;
        
        Self {
            sx,
            sy,
            txy,
            von_mises,
            s1,
            s2,
        }
    }
}

/// Summary of analysis results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisSummary {
    /// Maximum displacement
    pub max_displacement: f64,
    /// Node with maximum displacement
    pub max_disp_node: String,
    /// Maximum reaction force
    pub max_reaction: f64,
    /// Node with maximum reaction
    pub max_reaction_node: String,
    /// Maximum member axial force
    pub max_axial: f64,
    /// Member with maximum axial
    pub max_axial_member: String,
    /// Maximum member moment
    pub max_moment: f64,
    /// Member with maximum moment
    pub max_moment_member: String,
    /// Total number of nodes
    pub num_nodes: usize,
    /// Total number of members
    pub num_members: usize,
    /// Total number of plates/quads
    pub num_plates: usize,
    /// Total DOFs
    pub total_dofs: usize,
    /// Free DOFs (unknown)
    pub free_dofs: usize,
}

impl Default for AnalysisSummary {
    fn default() -> Self {
        Self {
            max_displacement: 0.0,
            max_disp_node: String::new(),
            max_reaction: 0.0,
            max_reaction_node: String::new(),
            max_axial: 0.0,
            max_axial_member: String::new(),
            max_moment: 0.0,
            max_moment_member: String::new(),
            num_nodes: 0,
            num_members: 0,
            num_plates: 0,
            total_dofs: 0,
            free_dofs: 0,
        }
    }
}
