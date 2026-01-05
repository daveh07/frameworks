//! Error types for FEA Solver

use thiserror::Error;

/// Main error type for FEA operations
#[derive(Error, Debug)]
pub enum FEAError {
    #[error("Node '{0}' not found in model")]
    NodeNotFound(String),

    #[error("Member '{0}' not found in model")]
    MemberNotFound(String),

    #[error("Material '{0}' not found in model")]
    MaterialNotFound(String),

    #[error("Section '{0}' not found in model")]
    SectionNotFound(String),

    #[error("Plate '{0}' not found in model")]
    PlateNotFound(String),

    #[error("Load combination '{0}' not found in model")]
    LoadCombinationNotFound(String),

    #[error("Load case '{0}' not found in model")]
    LoadCaseNotFound(String),

    #[error("Duplicate name '{0}' already exists")]
    DuplicateName(String),

    #[error("Model is unstable: {0}")]
    Unstable(String),

    #[error("Singular stiffness matrix - model may be unstable or have insufficient supports")]
    SingularMatrix,

    #[error("Analysis failed: {0}")]
    AnalysisFailed(String),

    #[error("Invalid geometry: {0}")]
    InvalidGeometry(String),

    #[error("Model not analyzed - run analyze() first")]
    NotAnalyzed,

    #[error("Convergence failed after {0} iterations")]
    ConvergenceFailed(usize),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Math error: {0}")]
    MathError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

/// Result type for FEA operations
pub type FEAResult<T> = Result<T, FEAError>;
