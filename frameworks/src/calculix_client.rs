use serde::{Deserialize, Serialize};
use crate::types::*;

/// Client for CalculiX FEA service
pub struct CalculixClient {
    base_url: String,
    client: reqwest::Client,
}

impl CalculixClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::Client::new(),
        }
    }

    /// Check if the service is healthy
    pub async fn health_check(&self) -> Result<HealthResponse, ClientError> {
        let url = format!("{}/health", self.base_url);
        let response = self.client
            .get(&url)
            .send()
            .await?
            .json()
            .await?;
        Ok(response)
    }

    /// Validate a structure without running analysis
    pub async fn validate_structure(&self, structure: &Structure) -> Result<ValidationResponse, ClientError> {
        let url = format!("{}/api/v1/validate", self.base_url);
        let request = AnalysisRequest {
            model: structure.clone(),
        };
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await?
            .json()
            .await?;
        
        Ok(response)
    }

    /// Submit structure for analysis
    pub async fn analyze_structure(&self, structure: &Structure) -> Result<AnalysisResponse, ClientError> {
        let url = format!("{}/api/v1/analyze", self.base_url);
        let request = AnalysisRequest {
            model: structure.clone(),
        };
        
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(ClientError::ApiError(error_text));
        }
        
        let result = response.json().await?;
        Ok(result)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisRequest {
    pub model: Structure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
    pub calculix_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResponse {
    pub status: String,
    pub nodes: usize,
    pub beams: usize,
    pub shells: usize,
    pub supports: usize,
    pub point_loads: usize,
    pub distributed_loads: usize,
    pub pressure_loads: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResponse {
    pub job_id: String,
    pub status: AnalysisStatus,
    pub results: Option<AnalysisResults>,
    pub error_message: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnalysisStatus {
    Queued,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResults {
    pub displacements: Vec<NodeDisplacement>,
    pub reactions: Vec<NodeReaction>,
    pub stresses: Vec<NodeStress>,
    #[serde(default)]
    pub beam_forces: Vec<BeamForces>,
    pub max_displacement: f64,
    pub max_stress: f64,
    #[serde(default)]
    pub max_beam_stress: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BeamForces {
    pub element_id: usize,
    pub axial_force: f64,
    pub shear_y: f64,
    pub shear_z: f64,
    pub moment_y: f64,
    pub moment_z: f64,
    pub torsion: f64,
    #[serde(default)]
    pub combined_stress: f64,
    #[serde(default)]
    pub axial_stress: f64,
    #[serde(default)]
    pub bending_stress: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDisplacement {
    pub node_id: usize,
    pub dx: f64,
    pub dy: f64,
    pub dz: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeReaction {
    pub node_id: usize,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStress {
    pub node_id: usize,
    pub von_mises: f64,
}

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] reqwest::Error),
    #[error("API error: {0}")]
    ApiError(String),
}
