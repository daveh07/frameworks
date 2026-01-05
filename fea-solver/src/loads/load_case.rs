//! Load cases

use serde::{Deserialize, Serialize};

/// A load case groups related loads under a common name
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadCase {
    /// Name of the load case
    pub name: String,
    /// Description of the load case
    pub description: Option<String>,
}

impl LoadCase {
    /// Create a new load case
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            description: None,
        }
    }

    /// Create a load case with description
    pub fn with_description(name: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            description: Some(description.to_string()),
        }
    }

    /// Common load case names
    pub fn dead() -> Self {
        Self::with_description("Dead", "Dead loads (self-weight and permanent loads)")
    }

    pub fn live() -> Self {
        Self::with_description("Live", "Live loads (occupancy, furniture, etc.)")
    }

    pub fn wind() -> Self {
        Self::with_description("Wind", "Wind loads")
    }

    pub fn seismic() -> Self {
        Self::with_description("Seismic", "Seismic/earthquake loads")
    }

    pub fn snow() -> Self {
        Self::with_description("Snow", "Snow loads")
    }
}

impl Default for LoadCase {
    fn default() -> Self {
        Self::new("Case 1")
    }
}
