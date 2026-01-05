//! Point loads on members

use serde::{Deserialize, Serialize};

/// Direction of a member load
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum LoadDirection {
    /// Force in member's local x direction (axial)
    Fx,
    /// Force in member's local y direction
    Fy,
    /// Force in member's local z direction
    Fz,
    /// Moment about member's local x axis (torsion)
    Mx,
    /// Moment about member's local y axis
    My,
    /// Moment about member's local z axis
    Mz,
    /// Force in global X direction
    FX,
    /// Force in global Y direction
    FY,
    /// Force in global Z direction
    FZ,
}

/// A concentrated load on a member
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointLoad {
    /// Load magnitude
    pub magnitude: f64,
    /// Distance from i-node
    pub position: f64,
    /// Load direction
    pub direction: LoadDirection,
    /// Load case
    pub case: String,
}

impl PointLoad {
    /// Create a new point load
    pub fn new(magnitude: f64, position: f64, direction: LoadDirection, case: &str) -> Self {
        Self {
            magnitude,
            position,
            direction,
            case: case.to_string(),
        }
    }

    /// Create a downward (negative Y) point load in global coordinates
    pub fn downward(magnitude: f64, position: f64, case: &str) -> Self {
        Self::new(-magnitude.abs(), position, LoadDirection::FY, case)
    }

    /// Create an axial load (in local x direction)
    pub fn axial(magnitude: f64, position: f64, case: &str) -> Self {
        Self::new(magnitude, position, LoadDirection::Fx, case)
    }

    /// Scale the load by a factor
    pub fn scaled(&self, factor: f64) -> Self {
        Self {
            magnitude: self.magnitude * factor,
            position: self.position,
            direction: self.direction,
            case: self.case.clone(),
        }
    }

    /// Check if this is a local coordinate load
    pub fn is_local(&self) -> bool {
        matches!(
            self.direction,
            LoadDirection::Fx
                | LoadDirection::Fy
                | LoadDirection::Fz
                | LoadDirection::Mx
                | LoadDirection::My
                | LoadDirection::Mz
        )
    }
}
