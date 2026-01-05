//! Plate/shell loads

use serde::{Deserialize, Serialize};

/// A surface pressure load on a plate element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlateLoad {
    /// Pressure magnitude (positive = outward from +Z face)
    pub pressure: f64,
    /// Load case
    pub case: String,
}

impl PlateLoad {
    /// Create a new pressure load
    pub fn new(pressure: f64, case: &str) -> Self {
        Self {
            pressure,
            case: case.to_string(),
        }
    }

    /// Create a downward pressure (for horizontal plates)
    pub fn downward(pressure: f64, case: &str) -> Self {
        Self::new(-pressure.abs(), case)
    }

    /// Create an upward pressure (for horizontal plates)
    pub fn upward(pressure: f64, case: &str) -> Self {
        Self::new(pressure.abs(), case)
    }

    /// Scale the load by a factor
    pub fn scaled(&self, factor: f64) -> Self {
        Self {
            pressure: self.pressure * factor,
            case: self.case.clone(),
        }
    }
}
