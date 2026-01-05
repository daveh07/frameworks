//! Client for FEA Solver service

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Client for the native Rust FEA solver service
pub struct FEAClient {
    base_url: String,
}

impl FEAClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
        }
    }

    /// Get the base URL for the client
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

// ========================
// Request Types
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAAnalysisRequest {
    pub model: FEAModelData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<FEAAnalysisOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAModelData {
    pub nodes: Vec<FEANodeData>,
    pub materials: Vec<FEAMaterialData>,
    pub sections: Vec<FEASectionData>,
    pub members: Vec<FEAMemberData>,
    pub supports: Vec<FEASupportData>,
    pub node_loads: Vec<FEANodeLoadData>,
    #[serde(default)]
    pub distributed_loads: Vec<FEADistributedLoadData>,
    #[serde(default)]
    pub load_combos: Vec<FEALoadComboData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEANodeData {
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAMaterialData {
    pub name: String,
    pub e: f64,     // Elastic modulus (Pa)
    pub g: f64,     // Shear modulus (Pa)
    pub nu: f64,    // Poisson's ratio
    pub rho: f64,   // Density (kg/m³)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEASectionData {
    pub name: String,
    pub a: f64,     // Cross-sectional area (m²)
    pub iy: f64,    // Moment of inertia about y-axis (m⁴)
    pub iz: f64,    // Moment of inertia about z-axis (m⁴)
    pub j: f64,     // Torsional constant (m⁴)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAMemberData {
    pub name: String,
    pub i_node: String,
    pub j_node: String,
    pub material: String,
    pub section: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEASupportData {
    pub node: String,
    pub dx: bool,
    pub dy: bool,
    pub dz: bool,
    pub rx: bool,
    pub ry: bool,
    pub rz: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEANodeLoadData {
    pub node: String,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    #[serde(default)]
    pub mx: f64,
    #[serde(default)]
    pub my: f64,
    #[serde(default)]
    pub mz: f64,
    #[serde(default = "default_case")]
    pub case: String,
}

fn default_case() -> String {
    "Case 1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEADistributedLoadData {
    pub member: String,
    pub w1: f64,        // Start magnitude
    pub w2: f64,        // End magnitude
    pub direction: String,  // "Fy" or "Fz"
    #[serde(default = "default_case")]
    pub case: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEALoadComboData {
    pub name: String,
    pub factors: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAAnalysisOptions {
    #[serde(default)]
    pub analysis_type: String,
    #[serde(default = "default_max_iter")]
    pub max_iterations: usize,
}

fn default_max_iter() -> usize {
    30
}

// ========================
// Response Types
// ========================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAAnalysisResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<FEAResultsData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAResultsData {
    pub node_displacements: Vec<FEANodeDisplacementResult>,
    pub reactions: Vec<FEAReactionResult>,
    pub member_forces: Vec<FEAMemberForceResult>,
    pub summary: FEASummaryResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEANodeDisplacementResult {
    pub node: String,
    pub combo: String,
    pub dx: f64,
    pub dy: f64,
    pub dz: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAReactionResult {
    pub node: String,
    pub combo: String,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAMemberForceResult {
    pub member: String,
    pub combo: String,
    pub axial_i: f64,
    pub shear_y_i: f64,
    pub shear_z_i: f64,
    pub torsion_i: f64,
    pub moment_y_i: f64,
    pub moment_z_i: f64,
    pub axial_j: f64,
    pub shear_y_j: f64,
    pub shear_z_j: f64,
    pub torsion_j: f64,
    pub moment_y_j: f64,
    pub moment_z_j: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEASummaryResult {
    pub max_displacement: f64,
    pub max_disp_node: String,
    pub max_reaction: f64,
    pub max_reaction_node: String,
    pub num_nodes: usize,
    pub num_members: usize,
    pub total_dofs: usize,
    pub free_dofs: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEAHealthResponse {
    pub status: String,
    pub version: String,
}

// ========================
// Section Properties Calculator
// ========================

/// Calculate section properties for common cross-section types
pub struct SectionCalculator;

impl SectionCalculator {
    /// Calculate rectangular section properties
    pub fn rectangular(width: f64, height: f64) -> FEASectionData {
        let a = width * height;
        let iy = width * height.powi(3) / 12.0;
        let iz = height * width.powi(3) / 12.0;
        // Approximate torsional constant for rectangular sections
        let (a_dim, b_dim) = if width > height { (width, height) } else { (height, width) };
        let j = a_dim * b_dim.powi(3) * (1.0 / 3.0 - 0.21 * (b_dim / a_dim) * (1.0 - b_dim.powi(4) / (12.0 * a_dim.powi(4))));
        
        FEASectionData {
            name: format!("Rect_{:.0}x{:.0}", width * 1000.0, height * 1000.0),
            a,
            iy,
            iz,
            j,
        }
    }

    /// Calculate circular section properties
    pub fn circular(diameter: f64) -> FEASectionData {
        let r = diameter / 2.0;
        let a = std::f64::consts::PI * r.powi(2);
        let i = std::f64::consts::PI * r.powi(4) / 4.0;
        let j = std::f64::consts::PI * r.powi(4) / 2.0;
        
        FEASectionData {
            name: format!("Circ_{:.0}", diameter * 1000.0),
            a,
            iy: i,
            iz: i,
            j,
        }
    }

    /// Calculate I-beam/wide flange section properties
    pub fn i_beam(height: f64, width: f64, flange_thickness: f64, web_thickness: f64) -> FEASectionData {
        let a = 2.0 * width * flange_thickness + (height - 2.0 * flange_thickness) * web_thickness;
        
        // Strong axis (about z, bending in y-z plane)
        let iz = (width * height.powi(3) - (width - web_thickness) * (height - 2.0 * flange_thickness).powi(3)) / 12.0;
        
        // Weak axis (about y)
        let iy = (2.0 * flange_thickness * width.powi(3) + (height - 2.0 * flange_thickness) * web_thickness.powi(3)) / 12.0;
        
        // Torsional constant (approximate for open thin-walled sections)
        let j = (2.0 * width * flange_thickness.powi(3) + (height - 2.0 * flange_thickness) * web_thickness.powi(3)) / 3.0;
        
        FEASectionData {
            name: format!("IBeam_{:.0}x{:.0}", height * 1000.0, width * 1000.0),
            a,
            iy,
            iz,
            j,
        }
    }
}
