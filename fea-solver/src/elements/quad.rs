//! Quad element - general quadrilateral shell element (MITC4 formulation)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::plate::PlateStresses;

/// A general quadrilateral shell element
/// Uses MITC4 formulation for better handling of distorted elements
/// 4 nodes with 6 DOFs per node (DX, DY, DZ, RX, RY, RZ)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quad {
    /// i-node name (corner 1)
    pub i_node: String,
    /// j-node name (corner 2)
    pub j_node: String,
    /// m-node name (corner 3)
    pub m_node: String,
    /// n-node name (corner 4)
    pub n_node: String,
    /// Thickness
    pub thickness: f64,
    /// Material name
    pub material: String,
    /// Local x stiffness modifier
    pub kx_mod: f64,
    /// Local y stiffness modifier
    pub ky_mod: f64,
    
    /// Nodal forces by load combination
    #[serde(skip)]
    pub(crate) forces: HashMap<String, [f64; 24]>,
    
    /// Nodal displacements by load combination
    #[serde(skip)]
    pub(crate) displacements: HashMap<String, [f64; 24]>,
    
    /// Internal stresses by load combination (at center and corners)
    #[serde(skip)]
    pub(crate) stresses: HashMap<String, QuadStresses>,
}

/// Stresses at various points in a quad element
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct QuadStresses {
    /// Stress at center
    pub center: PlateStresses,
    /// Stress at i-node corner
    pub i_corner: PlateStresses,
    /// Stress at j-node corner
    pub j_corner: PlateStresses,
    /// Stress at m-node corner
    pub m_corner: PlateStresses,
    /// Stress at n-node corner
    pub n_corner: PlateStresses,
}

impl Quad {
    /// Create a new quad element
    pub fn new(
        i_node: &str,
        j_node: &str,
        m_node: &str,
        n_node: &str,
        thickness: f64,
        material: &str,
    ) -> Self {
        Self {
            i_node: i_node.to_string(),
            j_node: j_node.to_string(),
            m_node: m_node.to_string(),
            n_node: n_node.to_string(),
            thickness,
            material: material.to_string(),
            kx_mod: 1.0,
            ky_mod: 1.0,
            forces: HashMap::new(),
            displacements: HashMap::new(),
            stresses: HashMap::new(),
        }
    }

    /// Set stiffness modifiers
    pub fn with_modifiers(mut self, kx_mod: f64, ky_mod: f64) -> Self {
        self.kx_mod = kx_mod;
        self.ky_mod = ky_mod;
        self
    }

    /// Get nodal forces for a load combination
    pub fn nodal_forces(&self, combo_name: &str) -> Option<[f64; 24]> {
        self.forces.get(combo_name).copied()
    }

    /// Get stresses for a load combination
    pub fn stress(&self, combo_name: &str) -> Option<&QuadStresses> {
        self.stresses.get(combo_name)
    }

    /// Get maximum von Mises stress across all points
    pub fn max_von_mises(&self, combo_name: &str) -> Option<f64> {
        let s = self.stresses.get(combo_name)?;
        
        let vm_center = von_mises_plane_stress(&s.center);
        let vm_i = von_mises_plane_stress(&s.i_corner);
        let vm_j = von_mises_plane_stress(&s.j_corner);
        let vm_m = von_mises_plane_stress(&s.m_corner);
        let vm_n = von_mises_plane_stress(&s.n_corner);
        
        Some(vm_center.max(vm_i).max(vm_j).max(vm_m).max(vm_n))
    }
}

/// Calculate von Mises stress for plane stress state
fn von_mises_plane_stress(s: &PlateStresses) -> f64 {
    (s.sx.powi(2) - s.sx * s.sy + s.sy.powi(2) + 3.0 * s.txy.powi(2)).sqrt()
}

impl Default for Quad {
    fn default() -> Self {
        Self::new("", "", "", "", 0.1, "")
    }
}
