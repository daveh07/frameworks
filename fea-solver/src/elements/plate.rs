//! Plate element - rectangular plate/shell element
//! Supports Kirchhoff, Mindlin, and DKMQ formulations

use crate::math::plate::PlateFormulation;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A rectangular plate element for shell analysis
/// Uses a 4-node element with 6 DOFs per node (DX, DY, DZ, RX, RY, RZ)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plate {
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
    /// Plate bending formulation (Kirchhoff, Mindlin, or DKMQ)
    pub formulation: PlateFormulation,
    
    /// Calculated width (j to i distance)
    #[serde(skip)]
    pub(crate) width: Option<f64>,
    
    /// Calculated height (m to j distance)
    #[serde(skip)]
    pub(crate) height: Option<f64>,
    
    /// Nodal forces by load combination
    #[serde(skip)]
    pub(crate) forces: HashMap<String, [f64; 24]>,
    
    /// Nodal displacements by load combination  
    #[serde(skip)]
    pub(crate) displacements: HashMap<String, [f64; 24]>,
    
    /// Internal stresses by load combination (at center)
    #[serde(skip)]
    pub(crate) stresses: HashMap<String, PlateStresses>,
}

/// Internal stresses in a plate element
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct PlateStresses {
    /// Membrane stress Sx (in-plane, x direction)
    pub sx: f64,
    /// Membrane stress Sy (in-plane, y direction)
    pub sy: f64,
    /// Membrane shear stress Txy (in-plane)
    pub txy: f64,
    /// Bending stress Mx (moment about x)
    pub mx: f64,
    /// Bending stress My (moment about y)
    pub my: f64,
    /// Twisting moment Mxy
    pub mxy: f64,
    /// Transverse shear Qx
    pub qx: f64,
    /// Transverse shear Qy
    pub qy: f64,
}

impl Plate {
    /// Create a new plate element with default Kirchhoff formulation
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
            formulation: PlateFormulation::Kirchhoff,
            width: None,
            height: None,
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

    /// Set plate bending formulation
    pub fn with_formulation(mut self, formulation: PlateFormulation) -> Self {
        self.formulation = formulation;
        self
    }

    /// Get dimensions
    pub fn dimensions(&self) -> Option<(f64, f64)> {
        match (self.width, self.height) {
            (Some(w), Some(h)) => Some((w, h)),
            _ => None,
        }
    }

    /// Get nodal forces for a load combination
    pub fn nodal_forces(&self, combo_name: &str) -> Option<[f64; 24]> {
        self.forces.get(combo_name).copied()
    }

    /// Get stresses for a load combination
    pub fn stress(&self, combo_name: &str) -> Option<PlateStresses> {
        self.stresses.get(combo_name).copied()
    }

    /// Get von Mises stress at plate center
    pub fn von_mises(&self, combo_name: &str) -> Option<f64> {
        let s = self.stresses.get(combo_name)?;
        // Von Mises for plane stress
        let vm = (s.sx.powi(2) - s.sx * s.sy + s.sy.powi(2) + 3.0 * s.txy.powi(2)).sqrt();
        Some(vm)
    }
}

impl Default for Plate {
    fn default() -> Self {
        Self::new("", "", "", "", 0.1, "").with_formulation(PlateFormulation::Kirchhoff)
    }
}
