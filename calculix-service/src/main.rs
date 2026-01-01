mod api;
mod executor;
mod generator;
mod models;

use std::path::Path;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "calculix_service=debug,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting CalculiX FEA Service");

    // Check if CalculiX is available
    let ccx_path = std::env::var("CALCULIX_PATH").unwrap_or_else(|_| {
        // Prefer a repo-local solver binary if present
        if Path::new("./bin/ccx").exists() {
            "./bin/ccx".to_string()
        } else {
            "ccx".to_string()
        }
    });

    // The executor runs ccx from a temp working directory, so relative paths would break.
    // Resolve to an absolute path when possible and export it for the rest of the process.
    let ccx_path = std::fs::canonicalize(&ccx_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(ccx_path);
    std::env::set_var("CALCULIX_PATH", &ccx_path);

    tracing::info!("Using CalculiX command: {}", ccx_path);

    // Verify CalculiX installation
    match std::process::Command::new(&ccx_path)
        .arg("-v")
        .output()
    {
        Ok(_) => tracing::info!("CalculiX found and accessible"),
        Err(e) => {
            tracing::warn!("CalculiX not found or not accessible: {}", e);
            tracing::warn!("Set CALCULIX_PATH environment variable to the correct path");
            tracing::warn!("Service will start but analyses will fail until CalculiX is available");
        }
    }

    // Build application router
    let app = api::create_router();

    // Bind to address
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8084".to_string());
    let addr = format!("{}:{}", host, port);

    tracing::info!("Listening on {}", addr);
    tracing::info!("API endpoints:");
    tracing::info!("  GET  /health");
    tracing::info!("  GET  /api/v1/version");
    tracing::info!("  POST /api/v1/analyze");
    tracing::info!("  POST /api/v1/validate");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
