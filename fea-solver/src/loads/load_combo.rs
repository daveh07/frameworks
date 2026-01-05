//! Load combinations

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A load combination defines how load cases are combined for analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadCombination {
    /// Name of the load combination
    pub name: String,
    /// Factors for each load case (case_name -> factor)
    pub factors: HashMap<String, f64>,
    /// Optional tags for filtering
    pub tags: Vec<String>,
}

impl LoadCombination {
    /// Create a new load combination
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            factors: HashMap::new(),
            tags: Vec::new(),
        }
    }

    /// Create a load combination with a single load case at factor 1.0
    pub fn single(name: &str, case: &str) -> Self {
        let mut combo = Self::new(name);
        combo.factors.insert(case.to_string(), 1.0);
        combo
    }

    /// Add a load case with a factor
    pub fn with_case(mut self, case: &str, factor: f64) -> Self {
        self.factors.insert(case.to_string(), factor);
        self
    }

    /// Add a tag
    pub fn with_tag(mut self, tag: &str) -> Self {
        self.tags.push(tag.to_string());
        self
    }

    /// Get the factor for a load case
    pub fn factor(&self, case: &str) -> f64 {
        *self.factors.get(case).unwrap_or(&0.0)
    }

    /// Check if this combination includes a specific load case
    pub fn includes(&self, case: &str) -> bool {
        self.factors.contains_key(case) && self.factors[case].abs() > 1e-10
    }

    /// Create common LRFD combinations
    pub fn lrfd_dead_only() -> Self {
        Self::new("1.4D")
            .with_case("Dead", 1.4)
    }

    pub fn lrfd_dead_live() -> Self {
        Self::new("1.2D + 1.6L")
            .with_case("Dead", 1.2)
            .with_case("Live", 1.6)
    }

    pub fn lrfd_dead_live_wind() -> Self {
        Self::new("1.2D + L + W")
            .with_case("Dead", 1.2)
            .with_case("Live", 1.0)
            .with_case("Wind", 1.0)
    }

    /// Create common ASD combinations
    pub fn asd_dead_live() -> Self {
        Self::new("D + L")
            .with_case("Dead", 1.0)
            .with_case("Live", 1.0)
    }

    pub fn asd_dead_live_wind() -> Self {
        Self::new("D + 0.75L + 0.75W")
            .with_case("Dead", 1.0)
            .with_case("Live", 0.75)
            .with_case("Wind", 0.75)
    }
}

impl Default for LoadCombination {
    fn default() -> Self {
        Self::single("Combo 1", "Case 1")
    }
}
