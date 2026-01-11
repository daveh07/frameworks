//! FEA Solver HTTP Server

use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

use fea_solver::prelude::*;
use fea_solver::loads::{DistributedLoad, LoadDirection, PlateLoad};

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[derive(Debug, Deserialize)]
struct AnalysisRequest {
    model: ModelData,
    options: Option<AnalysisOptionsData>,
}

#[derive(Debug, Deserialize)]
struct ModelData {
    nodes: Vec<NodeData>,
    materials: Vec<MaterialData>,
    sections: Vec<SectionData>,
    members: Vec<MemberData>,
    #[serde(default)]
    plates: Vec<PlateData>,
    supports: Vec<SupportData>,
    #[serde(default)]
    node_loads: Vec<NodeLoadData>,
    #[serde(default)]
    distributed_loads: Vec<DistributedLoadData>,
    #[serde(default)]
    plate_loads: Vec<PlateLoadData>,
    #[serde(default)]
    load_combos: Vec<LoadComboData>,
}

#[derive(Debug, Deserialize)]
struct DistributedLoadData {
    member: String,
    w1: f64,
    w2: f64,
    direction: String,
    #[serde(default = "default_case")]
    case: String,
}

#[derive(Debug, Deserialize)]
struct NodeData {
    name: String,
    x: f64,
    y: f64,
    z: f64,
}

#[derive(Debug, Deserialize)]
struct MaterialData {
    name: String,
    e: f64,
    g: f64,
    nu: f64,
    rho: f64,
}

#[derive(Debug, Deserialize)]
struct SectionData {
    name: String,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
}

#[derive(Debug, Deserialize)]
struct MemberData {
    name: String,
    i_node: String,
    j_node: String,
    material: String,
    section: String,
    #[serde(default)]
    rotation: f64,
    #[serde(default)]
    releases: Option<MemberReleasesData>,
}

#[derive(Debug, Deserialize, Clone)]
struct MemberReleasesData {
    #[serde(default)]
    i_node_ry: bool,
    #[serde(default)]
    i_node_rz: bool,
    #[serde(default)]
    j_node_ry: bool,
    #[serde(default)]
    j_node_rz: bool,
}

#[derive(Debug, Deserialize)]
struct PlateData {
    name: String,
    i_node: String,
    j_node: String,
    m_node: String,
    n_node: String,
    thickness: f64,
    material: String,
    #[serde(default = "default_kx_mod")]
    kx_mod: f64,
    #[serde(default = "default_ky_mod")]
    ky_mod: f64,
    #[serde(default = "default_formulation")]
    formulation: String,
}

fn default_kx_mod() -> f64 { 1.0 }
fn default_ky_mod() -> f64 { 1.0 }
fn default_formulation() -> String { "kirchhoff".to_string() }

#[derive(Debug, Deserialize)]
struct PlateLoadData {
    plate: String,
    pressure: f64,
    #[serde(default = "default_case")]
    case: String,
}

#[derive(Debug, Deserialize)]
struct SupportData {
    node: String,
    dx: bool,
    dy: bool,
    dz: bool,
    rx: bool,
    ry: bool,
    rz: bool,
}

#[derive(Debug, Deserialize)]
struct NodeLoadData {
    node: String,
    fx: f64,
    fy: f64,
    fz: f64,
    #[serde(default)]
    mx: f64,
    #[serde(default)]
    my: f64,
    #[serde(default)]
    mz: f64,
    #[serde(default = "default_case")]
    case: String,
}

fn default_case() -> String {
    "Case 1".to_string()
}

#[derive(Debug, Deserialize)]
struct LoadComboData {
    name: String,
    factors: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct AnalysisOptionsData {
    #[serde(default)]
    analysis_type: String,
    #[serde(default = "default_max_iter")]
    max_iterations: usize,
}

fn default_max_iter() -> usize {
    30
}

#[derive(Debug, Serialize)]
struct AnalysisResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    results: Option<ResultsData>,
}

#[derive(Debug, Serialize)]
struct ResultsData {
    node_displacements: Vec<NodeDisplacementResult>,
    reactions: Vec<ReactionResult>,
    member_forces: Vec<MemberForceResult>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    plate_stresses: Vec<PlateStressResult>,
    summary: SummaryResult,
}

#[derive(Debug, Serialize)]
struct NodeDisplacementResult {
    node: String,
    combo: String,
    dx: f64,
    dy: f64,
    dz: f64,
    rx: f64,
    ry: f64,
    rz: f64,
}

#[derive(Debug, Serialize)]
struct ReactionResult {
    node: String,
    combo: String,
    fx: f64,
    fy: f64,
    fz: f64,
    mx: f64,
    my: f64,
    mz: f64,
}

#[derive(Debug, Serialize)]
struct MemberForceResult {
    member: String,
    combo: String,
    axial_i: f64,
    shear_y_i: f64,
    shear_z_i: f64,
    torsion_i: f64,
    moment_y_i: f64,
    moment_z_i: f64,
    axial_j: f64,
    shear_y_j: f64,
    shear_z_j: f64,
    torsion_j: f64,
    moment_y_j: f64,
    moment_z_j: f64,
}

#[derive(Debug, Serialize)]
struct PlateStressResult {
    plate: String,
    combo: String,
    /// Normal stress in X direction at center (membrane)
    sx: f64,
    /// Normal stress in Y direction at center (membrane)
    sy: f64,
    /// Shear stress at center (membrane)
    txy: f64,
    /// Von Mises equivalent stress
    von_mises: f64,
    /// Bending moment Mx at center
    mx: f64,
    /// Bending moment My at center
    my: f64,
    /// Twisting moment Mxy at center
    mxy: f64,
}

#[derive(Debug, Serialize)]
struct SummaryResult {
    max_displacement: f64,
    max_disp_node: String,
    max_reaction: f64,
    max_reaction_node: String,
    num_nodes: usize,
    num_members: usize,
    total_dofs: usize,
    free_dofs: usize,
}

async fn health() -> impl IntoResponse {
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn analyze(Json(request): Json<AnalysisRequest>) -> impl IntoResponse {
    match run_analysis(request) {
        Ok(results) => (
            StatusCode::OK,
            Json(AnalysisResponse {
                success: true,
                error: None,
                results: Some(results),
            }),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(AnalysisResponse {
                success: false,
                error: Some(e.to_string()),
                results: None,
            }),
        ),
    }
}

fn run_analysis(request: AnalysisRequest) -> Result<ResultsData, fea_solver::error::FEAError> {
    let mut model = FEModel::new();

    // Add materials
    for mat in request.model.materials {
        model.add_material(&mat.name, Material::new(mat.e, mat.g, mat.nu, mat.rho))?;
    }

    // Add sections
    for sec in request.model.sections {
        model.add_section(&sec.name, Section::new(sec.a, sec.iy, sec.iz, sec.j))?;
    }

    // Add nodes
    for node in request.model.nodes {
        model.add_node(&node.name, Node::new(node.x, node.y, node.z))?;
    }

    // Add members with user-specified releases only
    // Note: We do NOT automatically release moments at pinned supports anymore.
    // The user explicitly controls releases via the beam properties panel.
    // Pinned supports already have free rotations at the support DOF level.
    for member in request.model.members {
        let mut m = Member::new(&member.i_node, &member.j_node, &member.material, &member.section);
        m.rotation = member.rotation;
        
        // Apply user-specified releases from the request
        if let Some(ref releases) = member.releases {
            // Apply user-specified releases: [DX, DY, DZ, RX, RY, RZ]
            m.releases.i_node = [false, false, false, false, releases.i_node_ry, releases.i_node_rz];
            m.releases.j_node = [false, false, false, false, releases.j_node_ry, releases.j_node_rz];
        }
        // If no releases specified, member defaults to fully fixed connections (all false)
        
        model.add_member(&member.name, m)?;
    }

    // Add plates (4-node shell elements)
    for plate in request.model.plates {
        // Parse formulation
        let formulation = match plate.formulation.to_lowercase().as_str() {
            "mindlin" | "mindlin-reissner" | "thick" => fea_solver::math::PlateFormulation::Mindlin,
            "dkmq" | "discrete-kirchhoff" => fea_solver::math::PlateFormulation::DKMQ,
            _ => fea_solver::math::PlateFormulation::Kirchhoff, // Default to Kirchhoff (thin plate)
        };
        
        let p = Plate::new(
            &plate.i_node,
            &plate.j_node,
            &plate.m_node,
            &plate.n_node,
            plate.thickness,
            &plate.material,
        )
        .with_modifiers(plate.kx_mod, plate.ky_mod)
        .with_formulation(formulation);
        
        model.add_plate(&plate.name, p)?;
    }

    // Add supports
    for sup in request.model.supports {
        model.add_support(
            &sup.node,
            Support::with_restraints(sup.dx, sup.dy, sup.dz, sup.rx, sup.ry, sup.rz),
        )?;
    }

    // Add node loads
    for load in request.model.node_loads {
        model.add_node_load(
            &load.node,
            NodeLoad::new(load.fx, load.fy, load.fz, load.mx, load.my, load.mz, &load.case),
        )?;
    }

    // Add distributed loads on members
    for load in request.model.distributed_loads {
        // Parse direction - use GLOBAL directions since loads from UI are in global coords
        let dir = match load.direction.to_uppercase().as_str() {
            "FX" => LoadDirection::FX,  // Global X
            "FY" => LoadDirection::FY,  // Global Y (gravity direction)
            "FZ" => LoadDirection::FZ,  // Global Z
            _ => LoadDirection::FY,     // Default to global Y (gravity direction)
        };
        
        // Use uniform load (w1 = w2) over entire member
        model.add_member_dist_load(
            &load.member,
            DistributedLoad::uniform(load.w1, dir, &load.case),
        )?;
    }

    // Add plate pressure loads
    for load in request.model.plate_loads {
        model.add_plate_load(
            &load.plate,
            PlateLoad::new(load.pressure, &load.case),
        )?;
    }

    // Add load combinations
    for combo in request.model.load_combos {
        let mut lc = LoadCombination::new(&combo.name);
        for (case, factor) in combo.factors {
            lc = lc.with_case(&case, factor);
        }
        model.add_load_combo(lc)?;
    }

    // Determine analysis type
    let options = match request.options {
        Some(opts) => match opts.analysis_type.to_lowercase().as_str() {
            "pdelta" | "p-delta" | "p_delta" => AnalysisOptions::p_delta()
                .with_max_iter(opts.max_iterations),
            _ => AnalysisOptions::linear(),
        },
        None => AnalysisOptions::linear(),
    };

    // Run analysis
    model.analyze(options)?;

    // Collect results
    let combo_names = model.combo_names();
    let first_combo = combo_names.first().cloned().unwrap_or_else(|| "Combo 1".to_string());

    let mut node_displacements = Vec::new();
    let mut reactions = Vec::new();
    let mut member_forces = Vec::new();
    let mut plate_stresses = Vec::new();

    for combo in &combo_names {
        // Node displacements
        for node_name in model.nodes.keys() {
            if let Ok(disp) = model.node_displacement(node_name, combo) {
                node_displacements.push(NodeDisplacementResult {
                    node: node_name.clone(),
                    combo: combo.clone(),
                    dx: disp.dx,
                    dy: disp.dy,
                    dz: disp.dz,
                    rx: disp.rx,
                    ry: disp.ry,
                    rz: disp.rz,
                });
            }
        }

        // Reactions
        for node_name in model.supports.keys() {
            if let Ok(rxn) = model.node_reactions(node_name, combo) {
                reactions.push(ReactionResult {
                    node: node_name.clone(),
                    combo: combo.clone(),
                    fx: rxn.fx,
                    fy: rxn.fy,
                    fz: rxn.fz,
                    mx: rxn.mx,
                    my: rxn.my,
                    mz: rxn.mz,
                });
            }
        }

        // Member forces
        for member_name in model.members.keys() {
            if let (Ok(fi), Ok(fj)) = (
                model.member_forces_i(member_name, combo),
                model.member_forces_j(member_name, combo),
            ) {
                member_forces.push(MemberForceResult {
                    member: member_name.clone(),
                    combo: combo.clone(),
                    axial_i: fi.axial,
                    shear_y_i: fi.shear_y,
                    shear_z_i: fi.shear_z,
                    torsion_i: fi.torsion,
                    moment_y_i: fi.moment_y,
                    moment_z_i: fi.moment_z,
                    axial_j: fj.axial,
                    shear_y_j: fj.shear_y,
                    shear_z_j: fj.shear_z,
                    torsion_j: fj.torsion,
                    moment_y_j: fj.moment_y,
                    moment_z_j: fj.moment_z,
                });
            }
        }

        // Plate stresses (for both plates and quads)
        for plate_name in model.plates.keys() {
            if let Ok(stress) = model.plate_stress(plate_name, combo) {
                plate_stresses.push(PlateStressResult {
                    plate: plate_name.clone(),
                    combo: combo.clone(),
                    sx: stress.sx,
                    sy: stress.sy,
                    txy: stress.txy,
                    von_mises: stress.von_mises,
                    mx: stress.mx,
                    my: stress.my,
                    mxy: stress.mxy,
                });
            }
        }

        for quad_name in model.quads.keys() {
            if let Ok(stress) = model.plate_stress(quad_name, combo) {
                plate_stresses.push(PlateStressResult {
                    plate: quad_name.clone(),
                    combo: combo.clone(),
                    sx: stress.sx,
                    sy: stress.sy,
                    txy: stress.txy,
                    von_mises: stress.von_mises,
                    mx: stress.mx,
                    my: stress.my,
                    mxy: stress.mxy,
                });
            }
        }
    }

    // Summary
    let summary = model.summary(&first_combo)?;

    Ok(ResultsData {
        node_displacements,
        reactions,
        member_forces,
        plate_stresses,
        summary: SummaryResult {
            max_displacement: summary.max_displacement,
            max_disp_node: summary.max_disp_node,
            max_reaction: summary.max_reaction,
            max_reaction_node: summary.max_reaction_node,
            num_nodes: summary.num_nodes,
            num_members: summary.num_members,
            total_dofs: summary.total_dofs,
            free_dofs: summary.free_dofs,
        },
    })
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/analyze", post(analyze))
        .layer(cors);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8086));
    println!("FEA Solver Server listening on http://{}", addr);
    println!("  Health check: GET  /health");
    println!("  Analysis:     POST /api/v1/analyze");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
