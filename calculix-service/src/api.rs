use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{CorsLayer, Any};
use uuid::Uuid;

use crate::executor::CalculiXExecutor;
use crate::generator::CalculiXGenerator;
use crate::models::{AnalysisRequest, AnalysisResponse, AnalysisStatus, StructuralModel};

pub type SharedExecutor = Arc<Mutex<CalculiXExecutor>>;

/// Application state
pub struct AppState {
    executor: SharedExecutor,
    generator: CalculiXGenerator,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            executor: Arc::new(Mutex::new(CalculiXExecutor::new())),
            generator: CalculiXGenerator::new(),
        }
    }
}

/// Build the API router
pub fn create_router() -> Router {
    let state = AppState::new();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_check))
        .route("/api/v1/analyze", post(analyze_handler))
        .route("/api/v1/version", get(version_handler))
        .route("/api/v1/validate", post(validate_handler))
        .layer(cors)
        .with_state(Arc::new(state))
}

/// Root endpoint
async fn root_handler() -> Json<serde_json::Value> {
    Json(json!({
        "service": "CalculiX FEA Service",
        "version": "0.1.0",
        "status": "running",
        "description": "Structural analysis for beams and shells using CalculiX (ccx) solver",
        "supported_elements": ["beams", "shells"],
        "supported_materials": ["steel", "custom"]
    }))
}

/// Health check endpoint
async fn health_check() -> Json<serde_json::Value> {
    // Check if CalculiX is available
    let ccx_path = crate::executor::resolve_ccx_path();
    
    let ccx_available = std::process::Command::new(&ccx_path)
        .arg("-v") // ccx -v usually prints version
        .output()
        .is_ok();

    Json(json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "calculix_available": ccx_available,
        "calculix_command": ccx_path
    }))
}

/// Version endpoint
async fn version_handler() -> Json<serde_json::Value> {
    Json(json!({
        "service": "CalculiX FEA Service",
        "version": "0.1.0",
        "api_version": "v1",
        "solver": "CalculiX (ccx)"
    }))
}

/// Validate model without running analysis
async fn validate_handler(
    State(_state): State<Arc<AppState>>,
    Json(request): Json<AnalysisRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    tracing::info!("Validating model");
    
    // Validate the model
    validate_model(&request.model)?;
    
    Ok(Json(json!({
        "valid": true,
        "message": "Model validation passed"
    })))
}

/// Run analysis
async fn analyze_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<AnalysisRequest>,
) -> Result<Json<AnalysisResponse>, ApiError> {
    tracing::info!("Received analysis request");
    tracing::info!("  Nodes: {}, Beams: {}, Shells: {}", 
        request.model.nodes.len(),
        request.model.beams.len(), 
        request.model.shells.len());
    tracing::info!("  Supports: {}, Point Loads: {}, Distributed Loads: {}, Pressure Loads: {}",
        request.model.supports.len(),
        request.model.point_loads.len(),
        request.model.distributed_loads.len(),
        request.model.pressure_loads.len());
    
    // Debug: Log support details
    for (i, support) in request.model.supports.iter().enumerate() {
        tracing::info!("  Support {}: node_id={}, type={:?}", i, support.node_id, support.constraint_type);
    }
    
    // Debug: Log material
    tracing::info!("  Material: E={}, nu={}, density={}", 
        request.model.material.elastic_modulus,
        request.model.material.poisson_ratio,
        request.model.material.density);
    
    // Debug: Log beam section
    if let Some(beam) = request.model.beams.first() {
        tracing::info!("  Beam section: {:?} {}x{}", 
            beam.section.section_type, beam.section.width, beam.section.height);
    }

    // 1. Validate model
    validate_model(&request.model)?;
    tracing::info!("Model validation passed");

    // 2. Generate Input File
    let inp_content = state.generator.generate_inp_file(&request.model)
        .map_err(|e| ApiError::InternalError(format!("Failed to generate input file: {}", e)))?;
    tracing::info!("Input file generated");

    // 3. Execute Analysis
    let mut executor = state.executor.lock().await;
    let results = executor.execute(&request.model, &inp_content).await
        .map_err(|e| ApiError::InternalError(format!("Analysis execution failed: {}", e)))?;

    Ok(Json(AnalysisResponse {
        job_id: Uuid::new_v4().to_string(),
        status: AnalysisStatus::Success,
        results: Some(results),
        error_message: None,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }))
}

fn validate_model(model: &StructuralModel) -> Result<(), ApiError> {
    if model.nodes.is_empty() {
        return Err(ApiError::ValidationError("Model must have at least one node".to_string()));
    }
    if model.beams.is_empty() && model.shells.is_empty() {
        return Err(ApiError::ValidationError("Model must include at least one beam or shell".to_string()));
    }
    if model.supports.is_empty() {
        return Err(ApiError::ValidationError("Model must have at least one support".to_string()));
    }
    Ok(())
}

/// API Errors
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Validation error: {0}")]
    ValidationError(String),
    #[error("Internal error: {0}")]
    InternalError(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::InternalError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };

        let body = Json(json!({
            "error": message
        }));

        (status, body).into_response()
    }
}
