//! Node loads - forces and moments applied directly to nodes

use serde::{Deserialize, Serialize};

/// A load applied directly to a node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeLoad {
    /// Force in X direction (N)
    pub fx: f64,
    /// Force in Y direction (N)
    pub fy: f64,
    /// Force in Z direction (N)
    pub fz: f64,
    /// Moment about X axis (N·m)
    pub mx: f64,
    /// Moment about Y axis (N·m)
    pub my: f64,
    /// Moment about Z axis (N·m)
    pub mz: f64,
    /// Load case this load belongs to
    pub case: String,
}

impl NodeLoad {
    /// Create a new node load with all components
    pub fn new(fx: f64, fy: f64, fz: f64, mx: f64, my: f64, mz: f64, case: &str) -> Self {
        Self {
            fx,
            fy,
            fz,
            mx,
            my,
            mz,
            case: case.to_string(),
        }
    }

    /// Create a force-only node load
    pub fn force(fx: f64, fy: f64, fz: f64, case: &str) -> Self {
        Self::new(fx, fy, fz, 0.0, 0.0, 0.0, case)
    }

    /// Create a moment-only node load
    pub fn moment(mx: f64, my: f64, mz: f64, case: &str) -> Self {
        Self::new(0.0, 0.0, 0.0, mx, my, mz, case)
    }

    /// Create a load in X direction
    pub fn fx(value: f64, case: &str) -> Self {
        Self::force(value, 0.0, 0.0, case)
    }

    /// Create a load in Y direction
    pub fn fy(value: f64, case: &str) -> Self {
        Self::force(0.0, value, 0.0, case)
    }

    /// Create a load in Z direction
    pub fn fz(value: f64, case: &str) -> Self {
        Self::force(0.0, 0.0, value, case)
    }

    /// Get the load as an array [FX, FY, FZ, MX, MY, MZ]
    pub fn as_array(&self) -> [f64; 6] {
        [self.fx, self.fy, self.fz, self.mx, self.my, self.mz]
    }

    /// Scale the load by a factor
    pub fn scaled(&self, factor: f64) -> Self {
        Self {
            fx: self.fx * factor,
            fy: self.fy * factor,
            fz: self.fz * factor,
            mx: self.mx * factor,
            my: self.my * factor,
            mz: self.mz * factor,
            case: self.case.clone(),
        }
    }
}

impl Default for NodeLoad {
    fn default() -> Self {
        Self::new(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, "Case 1")
    }
}
