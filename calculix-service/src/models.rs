use serde::{Deserialize, Serialize};

/// Main analysis request structure from the frameworkz app
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisRequest {
    pub model: StructuralModel,
    #[serde(default)]
    pub use_mock: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuralModel {
    pub nodes: Vec<Node>,
    pub beams: Vec<Beam>,
    pub shells: Vec<Shell>,
    pub material: Material,
    pub supports: Vec<Support>,
    pub point_loads: Vec<PointLoad>,
    pub distributed_loads: Vec<DistributedLoad>,
    pub pressure_loads: Vec<PressureLoad>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: usize,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Beam {
    pub id: usize,
    pub node_ids: Vec<usize>,  // Start and end node
    pub section: BeamSection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamSection {
    pub width: f64,       // For RECT: width, For I-beam: flange width (bf)
    pub height: f64,      // For RECT: height, For I-beam: total depth (d)
    pub section_type: SectionType,
    #[serde(default)]
    pub flange_thickness: Option<f64>,  // tf for I-beam
    #[serde(default)]
    pub web_thickness: Option<f64>,     // tw for I-beam
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shell {
    pub id: usize,
    pub node_ids: Vec<usize>,
    pub thickness: f64,
    #[serde(default)]
    pub is_quadratic: bool,  // True for S8 (8-node), false for S4 (4-node)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SectionType {
    Rectangular,
    Circular,
    IBeam,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material {
    pub name: String,
    pub elastic_modulus: f64,  // Pa or kN/m²
    pub poisson_ratio: f64,
    pub density: f64,          // kg/m³ or kN/m³
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Support {
    pub node_id: usize,
    pub constraint_type: SupportType,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SupportType {
    Fixed,      // All DOFs constrained (DX, DY, DZ, DRX, DRY, DRZ)
    Pinned,     // Translations constrained, rotations free (DX, DY, DZ)
    RollerX,    // Y, Z constrained, X free (DY, DZ)
    RollerY,    // X, Z constrained, Y free (DX, DZ)
    RollerZ,    // X, Y constrained, Z free (DX, DY)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointLoad {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PressureLoad {
    pub element_ids: Vec<usize>,
    pub magnitude: f64, // Pressure value (Pa)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributedLoad {
    pub element_ids: Vec<usize>,
    pub load_type: LoadType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LoadType {
    Gravity { g: f64 },
    Uniform { value: f64, direction: LoadDirection },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LoadDirection {
    X,
    Y,
    Z,
}

/// Analysis response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResponse {
    pub job_id: String,
    pub status: AnalysisStatus,
    pub results: Option<AnalysisResults>,
    pub error_message: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnalysisStatus {
    Success,
    Failed,
    Running,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResults {
    pub displacements: Vec<NodeDisplacement>,
    pub reactions: Vec<NodeReaction>,
    pub stresses: Vec<NodeStress>, // Changed from ElementStress to NodeStress
    pub beam_forces: Vec<BeamForces>, // NEW: Beam section forces
    pub max_displacement: f64,
    pub max_stress: f64,
    /// Maximum beam stress (Pa) for beam elements
    pub max_beam_stress: f64,
}

/// Beam section forces at stations along a beam element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamForces {
    pub element_id: usize,
    /// Axial force (N) - tension positive
    pub axial_force: f64,
    /// Shear force in local y direction (Vy)
    pub shear_y: f64,
    /// Shear force in local z direction (Vz)
    pub shear_z: f64,
    /// Bending moment about local y axis (My)
    pub moment_y: f64,
    /// Bending moment about local z axis (Mz)
    pub moment_z: f64,
    /// Torsional moment (Mx)
    pub torsion: f64,
    /// Calculated combined stress (Pa) - Von Mises equivalent
    #[serde(default)]
    pub combined_stress: f64,
    /// Axial stress (Pa) = N/A
    #[serde(default)]
    pub axial_stress: f64,
    /// Maximum bending stress (Pa) = M*y/I
    #[serde(default)]
    pub bending_stress: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDisplacement {
    pub node_id: usize,
    pub dx: f64,
    pub dy: f64,
    pub dz: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeReaction {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStress {
    pub node_id: usize,
    pub von_mises: f64,
    // For shells: top and bottom surface stresses (middle = von_mises)
    pub von_mises_top: Option<f64>,
    pub von_mises_bottom: Option<f64>,
    // Individual stress components (for advanced visualization)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sxx: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub syy: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub szz: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sxy: Option<f64>,
}

// Internal struct for parsing element stresses before averaging
#[derive(Debug, Clone)]
pub struct ElementStress {
    pub element_id: usize,
    pub integration_point: usize, // 1=bottom, 2=middle, 3=top for shells
    pub von_mises: f64,
    pub sxx: f64,
    pub syy: f64,
    pub szz: f64,
    pub sxy: f64,
    pub syz: f64,
    pub szx: f64,
}
