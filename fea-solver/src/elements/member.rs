//! Member element - 3D frame element (beam/column)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// End releases for a member (allowing specific DOFs to rotate/translate freely)
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct MemberReleases {
    /// i-node releases [DX, DY, DZ, RX, RY, RZ]
    pub i_node: [bool; 6],
    /// j-node releases [DX, DY, DZ, RX, RY, RZ]
    pub j_node: [bool; 6],
}

impl MemberReleases {
    /// Create releases with no end releases
    pub fn none() -> Self {
        Self::default()
    }

    /// Create releases for a pin at the i-node (moment releases)
    pub fn pin_i() -> Self {
        Self {
            i_node: [false, false, false, false, true, true],
            j_node: [false; 6],
        }
    }

    /// Create releases for a pin at the j-node (moment releases)
    pub fn pin_j() -> Self {
        Self {
            i_node: [false; 6],
            j_node: [false, false, false, false, true, true],
        }
    }

    /// Create releases for pins at both ends
    pub fn pin_both() -> Self {
        Self {
            i_node: [false, false, false, false, true, true],
            j_node: [false, false, false, false, true, true],
        }
    }

    /// Get combined releases as 12-element array
    pub fn as_array(&self) -> [bool; 12] {
        let mut arr = [false; 12];
        arr[0..6].copy_from_slice(&self.i_node);
        arr[6..12].copy_from_slice(&self.j_node);
        arr
    }
}

/// A 3D frame member (beam or column)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    /// Name of the i-node (start)
    pub i_node: String,
    /// Name of the j-node (end)
    pub j_node: String,
    /// Name of the material
    pub material: String,
    /// Name of the section
    pub section: String,
    /// Rotation about longitudinal axis (radians)
    pub rotation: f64,
    /// End releases
    pub releases: MemberReleases,
    /// Tension-only flag (for braces)
    pub tension_only: bool,
    /// Compression-only flag
    pub compression_only: bool,
    
    /// Calculated length
    #[serde(skip)]
    pub(crate) length: Option<f64>,
    
    /// Local end forces by load combination [Fx_i, Fy_i, Fz_i, Mx_i, My_i, Mz_i, Fx_j, Fy_j, Fz_j, Mx_j, My_j, Mz_j]
    #[serde(skip)]
    pub(crate) local_forces: HashMap<String, [f64; 12]>,
    
    /// Global end forces by load combination
    #[serde(skip)]
    pub(crate) global_forces: HashMap<String, [f64; 12]>,
    
    /// Local displacements by load combination
    #[serde(skip)]
    pub(crate) local_displacements: HashMap<String, [f64; 12]>,
}

impl Member {
    /// Create a new member
    pub fn new(i_node: &str, j_node: &str, material: &str, section: &str) -> Self {
        Self {
            i_node: i_node.to_string(),
            j_node: j_node.to_string(),
            material: material.to_string(),
            section: section.to_string(),
            rotation: 0.0,
            releases: MemberReleases::none(),
            tension_only: false,
            compression_only: false,
            length: None,
            local_forces: HashMap::new(),
            global_forces: HashMap::new(),
            local_displacements: HashMap::new(),
        }
    }

    /// Set member rotation about its longitudinal axis
    pub fn with_rotation(mut self, rotation: f64) -> Self {
        self.rotation = rotation;
        self
    }

    /// Set member end releases
    pub fn with_releases(mut self, releases: MemberReleases) -> Self {
        self.releases = releases;
        self
    }

    /// Set as tension-only member
    pub fn tension_only(mut self) -> Self {
        self.tension_only = true;
        self.compression_only = false;
        self
    }

    /// Set as compression-only member
    pub fn compression_only(mut self) -> Self {
        self.compression_only = true;
        self.tension_only = false;
        self
    }

    /// Get the member length
    pub fn length(&self) -> Option<f64> {
        self.length
    }

    /// Get local forces for a load combination
    /// Returns [Fx_i, Fy_i, Fz_i, Mx_i, My_i, Mz_i, Fx_j, Fy_j, Fz_j, Mx_j, My_j, Mz_j]
    pub fn local_force(&self, combo_name: &str) -> Option<[f64; 12]> {
        self.local_forces.get(combo_name).copied()
    }

    /// Get axial force at a position along the member
    /// 
    /// # Arguments
    /// * `_x` - Distance from i-node (reserved for future use with distributed loads)
    /// * `combo_name` - Load combination name
    pub fn axial(&self, _x: f64, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        // Axial force is constant (for now, without distributed loads)
        // P = -Fx_i (positive tension)
        Some(-forces[0])
    }

    /// Get shear force in local y direction at position x
    pub fn shear_y(&self, _x: f64, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        // Vy = -Fy_i (constant without distributed loads)
        Some(-forces[1])
    }

    /// Get shear force in local z direction at position x
    pub fn shear_z(&self, x: f64, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        let _ = x;
        Some(-forces[2])
    }

    /// Get bending moment about local y axis at position x
    pub fn moment_y(&self, x: f64, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        // My = My_i + Fz_i * x
        Some(forces[4] + forces[2] * x)
    }

    /// Get bending moment about local z axis at position x
    pub fn moment_z(&self, x: f64, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        // Mz = Mz_i - Fy_i * x
        Some(forces[5] - forces[1] * x)
    }

    /// Get torsion at position x
    pub fn torsion(&self, x: f64, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        let _ = x;
        // Torsion is constant
        Some(-forces[3])
    }

    /// Get maximum absolute axial force
    pub fn max_axial(&self, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        Some(forces[0].abs().max(forces[6].abs()))
    }

    /// Get maximum absolute shear force in y
    pub fn max_shear_y(&self, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        Some(forces[1].abs().max(forces[7].abs()))
    }

    /// Get maximum absolute shear force in z
    pub fn max_shear_z(&self, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        Some(forces[2].abs().max(forces[8].abs()))
    }

    /// Get maximum absolute moment about y
    pub fn max_moment_y(&self, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        Some(forces[4].abs().max(forces[10].abs()))
    }

    /// Get maximum absolute moment about z
    pub fn max_moment_z(&self, combo_name: &str) -> Option<f64> {
        let forces = self.local_forces.get(combo_name)?;
        Some(forces[5].abs().max(forces[11].abs()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_member_creation() {
        let member = Member::new("N1", "N2", "Steel", "W12x26");
        assert_eq!(member.i_node, "N1");
        assert_eq!(member.j_node, "N2");
        assert_eq!(member.rotation, 0.0);
    }

    #[test]
    fn test_releases() {
        let releases = MemberReleases::pin_i();
        let arr = releases.as_array();
        assert!(!arr[0]); // DX not released
        assert!(arr[4]);  // RY released
        assert!(arr[5]);  // RZ released
    }
}
