use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Storey {
    pub name: String,
    pub elevation: f64, // Y-coordinate height
    pub visible: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Plate {
    pub id: String,
    pub geometry: PlateGeometry,
    pub boundary_conditions: Vec<BoundaryCondition>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlateGeometry {
    pub width: f64,
    pub height: f64,
    pub thickness: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BoundaryCondition {
    pub edge: String,
    pub constraint_type: ConstraintType,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ConstraintType {
    Fixed,
    Pinned,
    Roller { direction: String },
    Free,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ModellingTool {
    Select,
    DrawWall,
    DrawPlate,
}

// Structural Analysis Types
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: usize,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Beam {
    pub id: usize,
    pub node_ids: Vec<usize>,
    pub section: BeamSection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BeamSection {
    pub width: f64,
    pub height: f64,
    pub section_type: SectionType,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Shell {
    pub id: usize,
    pub node_ids: Vec<usize>,
    pub thickness: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SectionType {
    Rectangular,
    Circular,
    IBeam,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Material {
    pub name: String,
    pub elastic_modulus: f64,
    pub poisson_ratio: f64,
    pub density: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PointLoad {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DistributedLoad {
    pub element_ids: Vec<usize>,
    pub load_type: LoadType,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LoadType {
    Gravity { g: f64 },
    Uniform { value: f64, direction: LoadDirection },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LoadDirection {
    X,
    Y,
    Z,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Support {
    pub node_id: usize,
    pub constraint_type: SupportType,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SupportType {
    Fixed,      // All DOFs constrained
    Pinned,     // Translations constrained, rotations free
    RollerX,    // Y, Z constrained, X free
    RollerY,    // X, Z constrained, Y free
    RollerZ,    // X, Y constrained, Z free
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Structure {
    pub nodes: Vec<Node>,
    pub beams: Vec<Beam>,
    pub shells: Vec<Shell>,
    pub material: Material,
    pub point_loads: Vec<PointLoad>,
    pub distributed_loads: Vec<DistributedLoad>,
    pub supports: Vec<Support>,
}

// Analysis-related types removed - no longer using CalculiX