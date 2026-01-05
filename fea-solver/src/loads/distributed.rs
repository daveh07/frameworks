//! Distributed loads on members

use serde::{Deserialize, Serialize};
use super::point_load::LoadDirection;

/// A distributed (line) load on a member
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributedLoad {
    /// Start magnitude (at start position)
    pub w1: f64,
    /// End magnitude (at end position)
    pub w2: f64,
    /// Start position (distance from i-node)
    pub x1: f64,
    /// End position (distance from i-node)
    pub x2: f64,
    /// Load direction
    pub direction: LoadDirection,
    /// Load case
    pub case: String,
}

impl DistributedLoad {
    /// Create a new distributed load
    pub fn new(w1: f64, w2: f64, x1: f64, x2: f64, direction: LoadDirection, case: &str) -> Self {
        Self {
            w1,
            w2,
            x1,
            x2,
            direction,
            case: case.to_string(),
        }
    }

    /// Create a uniform distributed load over the full member length
    /// Note: x2 should be set to member length after creation
    pub fn uniform(w: f64, direction: LoadDirection, case: &str) -> Self {
        Self::new(w, w, 0.0, f64::INFINITY, direction, case)
    }

    /// Create a uniform downward load (negative global Y)
    pub fn uniform_downward(w: f64, case: &str) -> Self {
        Self::uniform(-w.abs(), LoadDirection::FY, case)
    }

    /// Create a triangular load (zero at start, max at end)
    pub fn triangular(w_max: f64, x1: f64, x2: f64, direction: LoadDirection, case: &str) -> Self {
        Self::new(0.0, w_max, x1, x2, direction, case)
    }

    /// Check if the load is uniform (constant magnitude)
    pub fn is_uniform(&self) -> bool {
        (self.w1 - self.w2).abs() < 1e-10
    }

    /// Scale the load by a factor
    pub fn scaled(&self, factor: f64) -> Self {
        Self {
            w1: self.w1 * factor,
            w2: self.w2 * factor,
            x1: self.x1,
            x2: self.x2,
            direction: self.direction,
            case: self.case.clone(),
        }
    }

    /// Get the total force from this load
    pub fn total_force(&self) -> f64 {
        let length = self.x2 - self.x1;
        (self.w1 + self.w2) / 2.0 * length
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
