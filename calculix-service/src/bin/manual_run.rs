#[path = "../generator.rs"]
mod generator;
#[path = "../executor.rs"]
mod executor;
#[path = "../models.rs"]
mod models;

use generator::CalculiXGenerator;
use executor::CalculiXExecutor;
use models::AnalysisRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();
    let request_path = args.get(1)
        .map(|s| s.as_str())
        .unwrap_or("sample_request.json");

    let json = std::fs::read_to_string(request_path)?;
    let request: AnalysisRequest = serde_json::from_str(&json)?;

    let generator = CalculiXGenerator::new();
    let inp = generator.generate_inp_file(&request.model)?;

    let mut executor = CalculiXExecutor::new();
    let results = executor.execute(&request.model, &inp).await?;

    println!("{}", serde_json::to_string_pretty(&results)?);
    Ok(())
}
