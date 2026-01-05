//! FEA Solver - A native Rust Finite Element Analysis library
//!
//! This library provides a comprehensive 3D structural analysis framework
//! inspired by PyNite, supporting:
//! - Frame elements (beams, columns)
//! - Shell/Plate elements (MITC4 formulation)
//! - Linear static analysis
//! - P-Delta (second order) analysis
//! - Modal analysis (eigenvalue)
//!
//! ## Example
//! ```rust
//! use fea_solver::prelude::*;
//!
//! let mut model = FEModel::new();
//!
//! // Add material
//! model.add_material("Steel", Material::new(200e9, 77e9, 0.3, 7850.0));
//!
//! // Add section
//! model.add_section("W12x26", Section::new(7.65e-3, 204e-6, 17.3e-6, 0.3e-6));
//!
//! // Add nodes
//! model.add_node("N1", Node::new(0.0, 0.0, 0.0));
//! model.add_node("N2", Node::new(10.0, 0.0, 0.0));
//!
//! // Add member
//! model.add_member("M1", Member::new("N1", "N2", "Steel", "W12x26"));
//!
//! // Add supports
//! model.add_support("N1", Support::fixed());
//!
//! // Add loads
//! model.add_node_load("N2", NodeLoad::force(0.0, -10000.0, 0.0, "Dead"));
//!
//! // Analyze
//! model.analyze_linear().unwrap();
//!
//! // Get results
//! let displacement = model.node_displacement("N2", "Combo 1").unwrap();
//! ```

pub mod analysis;
pub mod elements;
pub mod error;
pub mod loads;
pub mod math;
pub mod model;
pub mod results;

// Re-export common types
pub mod prelude {
    pub use crate::analysis::{AnalysisOptions, AnalysisType};
    pub use crate::elements::{
        Material, Member, MemberReleases, Node, Plate, Quad, Section, Support,
    };
    pub use crate::error::{FEAError, FEAResult};
    pub use crate::loads::{
        DistributedLoad, LoadCase, LoadCombination, NodeLoad, PlateLoad, PointLoad,
    };
    pub use crate::model::FEModel;
    pub use crate::results::{MemberForces, NodeDisplacement, PlateStress, Reactions};
}

#[cfg(feature = "wasm")]
pub mod wasm;
