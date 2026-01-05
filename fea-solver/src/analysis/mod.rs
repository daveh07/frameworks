//! Analysis types and options

use serde::{Deserialize, Serialize};

/// Type of structural analysis to perform
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnalysisType {
    /// First-order linear static analysis
    Linear,
    /// Second-order P-Delta analysis
    PDelta,
    /// Nonlinear analysis with tension/compression only members
    Nonlinear,
    /// Modal (eigenvalue) analysis for natural frequencies
    Modal,
}

impl Default for AnalysisType {
    fn default() -> Self {
        Self::Linear
    }
}

/// Options for structural analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisOptions {
    /// Type of analysis
    pub analysis_type: AnalysisType,
    /// Check for model stability
    pub check_stability: bool,
    /// Check static equilibrium after analysis
    pub check_statics: bool,
    /// Maximum iterations for nonlinear/P-Delta analysis
    pub max_iterations: usize,
    /// Convergence tolerance
    pub tolerance: f64,
    /// Use sparse matrix solver
    pub sparse: bool,
    /// Load combination tags to analyze (None = all)
    pub combo_tags: Option<Vec<String>>,
    /// Number of modes to calculate (for modal analysis)
    pub num_modes: usize,
    /// Enable logging/progress output
    pub log: bool,
}

impl Default for AnalysisOptions {
    fn default() -> Self {
        Self {
            analysis_type: AnalysisType::Linear,
            check_stability: true,
            check_statics: false,
            max_iterations: 30,
            tolerance: 1e-6,
            sparse: true,
            combo_tags: None,
            num_modes: 12,
            log: false,
        }
    }
}

impl AnalysisOptions {
    /// Create options for linear analysis
    pub fn linear() -> Self {
        Self::default()
    }

    /// Create options for P-Delta analysis
    pub fn p_delta() -> Self {
        Self {
            analysis_type: AnalysisType::PDelta,
            ..Self::default()
        }
    }

    /// Create options for modal analysis
    pub fn modal(num_modes: usize) -> Self {
        Self {
            analysis_type: AnalysisType::Modal,
            num_modes,
            ..Self::default()
        }
    }

    /// Enable logging
    pub fn with_logging(mut self) -> Self {
        self.log = true;
        self
    }

    /// Set maximum iterations
    pub fn with_max_iter(mut self, max_iter: usize) -> Self {
        self.max_iterations = max_iter;
        self
    }

    /// Set convergence tolerance
    pub fn with_tolerance(mut self, tol: f64) -> Self {
        self.tolerance = tol;
        self
    }

    /// Filter by combo tags
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.combo_tags = Some(tags);
        self
    }
}
