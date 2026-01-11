//! WASM bindings for FEA Solver
//! 
//! This module provides WebAssembly bindings to run the FEA solver directly
//! in the browser, eliminating HTTP overhead for maximum performance.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::prelude::*;
use crate::loads::{DistributedLoad, LoadDirection, PlateLoad};

// Use wee_alloc for smaller WASM binary
#[cfg(feature = "wasm")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// Initialize panic hook for better error messages in browser console
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "wasm")]
    console_error_panic_hook::set_once();
}

// ========================
// Input Data Structures
// ========================

#[derive(Debug, Deserialize)]
pub struct AnalysisRequest {
    pub model: ModelData,
    pub options: Option<AnalysisOptionsData>,
}

#[derive(Debug, Deserialize)]
pub struct ModelData {
    pub nodes: Vec<NodeData>,
    pub materials: Vec<MaterialData>,
    pub sections: Vec<SectionData>,
    pub members: Vec<MemberData>,
    #[serde(default)]
    pub plates: Vec<PlateData>,
    pub supports: Vec<SupportData>,
    #[serde(default)]
    pub node_loads: Vec<NodeLoadData>,
    #[serde(default)]
    pub distributed_loads: Vec<DistributedLoadData>,
    #[serde(default)]
    pub plate_loads: Vec<PlateLoadData>,
    #[serde(default)]
    pub load_combos: Vec<LoadComboData>,
}

#[derive(Debug, Deserialize)]
pub struct NodeData {
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Deserialize)]
pub struct MaterialData {
    pub name: String,
    pub e: f64,
    pub g: f64,
    pub nu: f64,
    pub rho: f64,
}

#[derive(Debug, Deserialize)]
pub struct SectionData {
    pub name: String,
    pub a: f64,
    pub iy: f64,
    pub iz: f64,
    pub j: f64,
}

#[derive(Debug, Deserialize)]
pub struct MemberData {
    pub name: String,
    pub i_node: String,
    pub j_node: String,
    pub material: String,
    pub section: String,
    #[serde(default)]
    pub rotation: f64,
    #[serde(default)]
    pub releases: Option<MemberReleasesData>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MemberReleasesData {
    #[serde(default)]
    pub i_node_ry: bool,
    #[serde(default)]
    pub i_node_rz: bool,
    #[serde(default)]
    pub j_node_ry: bool,
    #[serde(default)]
    pub j_node_rz: bool,
}

#[derive(Debug, Deserialize)]
pub struct PlateData {
    pub name: String,
    pub i_node: String,
    pub j_node: String,
    pub m_node: String,
    pub n_node: String,
    pub thickness: f64,
    pub material: String,
    #[serde(default = "default_kx_mod")]
    pub kx_mod: f64,
    #[serde(default = "default_ky_mod")]
    pub ky_mod: f64,
    #[serde(default = "default_formulation")]
    pub formulation: String,
}

fn default_kx_mod() -> f64 { 1.0 }
fn default_ky_mod() -> f64 { 1.0 }
fn default_formulation() -> String { "kirchhoff".to_string() }

#[derive(Debug, Deserialize)]
pub struct SupportData {
    pub node: String,
    pub dx: bool,
    pub dy: bool,
    pub dz: bool,
    pub rx: bool,
    pub ry: bool,
    pub rz: bool,
}

#[derive(Debug, Deserialize)]
pub struct NodeLoadData {
    pub node: String,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    #[serde(default)]
    pub mx: f64,
    #[serde(default)]
    pub my: f64,
    #[serde(default)]
    pub mz: f64,
    #[serde(default = "default_case")]
    pub case: String,
}

#[derive(Debug, Deserialize)]
pub struct DistributedLoadData {
    pub member: String,
    pub w1: f64,
    #[serde(default)]
    pub w2: f64,
    pub direction: String,
    #[serde(default = "default_case")]
    pub case: String,
}

#[derive(Debug, Deserialize)]
pub struct PlateLoadData {
    pub plate: String,
    pub pressure: f64,
    #[serde(default = "default_case")]
    pub case: String,
}

#[derive(Debug, Deserialize)]
pub struct LoadComboData {
    pub name: String,
    pub factors: HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
pub struct AnalysisOptionsData {
    #[serde(default)]
    pub analysis_type: String,
    #[serde(default = "default_max_iter")]
    pub max_iterations: usize,
}

fn default_case() -> String { "Case 1".to_string() }
fn default_max_iter() -> usize { 30 }

// ========================
// Output Data Structures
// ========================

#[derive(Debug, Serialize)]
pub struct AnalysisResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<ResultsData>,
    /// Timing information in milliseconds
    pub ms_elapsed: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ResultsData {
    pub node_displacements: Vec<NodeDisplacementResult>,
    pub reactions: Vec<ReactionResult>,
    pub member_forces: Vec<MemberForceResult>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub plate_stresses: Vec<PlateStressResultData>,
    pub summary: SummaryResult,
}

#[derive(Debug, Serialize)]
pub struct NodeDisplacementResult {
    pub node: String,
    pub combo: String,
    pub dx: f64,
    pub dy: f64,
    pub dz: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
}

#[derive(Debug, Serialize)]
pub struct ReactionResult {
    pub node: String,
    pub combo: String,
    pub fx: f64,
    pub fy: f64,
    pub fz: f64,
    pub mx: f64,
    pub my: f64,
    pub mz: f64,
}

#[derive(Debug, Serialize)]
pub struct MemberForceResult {
    pub member: String,
    pub combo: String,
    pub axial_i: f64,
    pub shear_y_i: f64,
    pub shear_z_i: f64,
    pub torsion_i: f64,
    pub moment_y_i: f64,
    pub moment_z_i: f64,
    pub axial_j: f64,
    pub shear_y_j: f64,
    pub shear_z_j: f64,
    pub torsion_j: f64,
    pub moment_y_j: f64,
    pub moment_z_j: f64,
}

#[derive(Debug, Serialize)]
pub struct PlateStressResultData {
    pub plate: String,
    pub combo: String,
    pub sx: f64,
    pub sy: f64,
    pub txy: f64,
    pub von_mises: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
}

#[derive(Debug, Serialize)]
pub struct SummaryResult {
    pub max_displacement: f64,
    pub max_disp_node: String,
    pub max_reaction: f64,
    pub max_reaction_node: String,
    pub num_nodes: usize,
    pub num_members: usize,
    pub total_dofs: usize,
    pub free_dofs: usize,
}

// ========================
// Main WASM Entry Point
// ========================

/// Analyze a structural model
/// 
/// Takes a JSON string containing the model and options,
/// returns a JSON string with the results.
/// 
/// This function is designed to be called from a Web Worker.
#[wasm_bindgen]
pub fn analyze(request_json: &str) -> String {
    let start = web_sys_time();
    
    let result = match serde_json::from_str::<AnalysisRequest>(request_json) {
        Ok(request) => run_analysis(request, start),
        Err(e) => AnalysisResponse {
            success: false,
            error: Some(format!("Failed to parse request: {}", e)),
            results: None,
            ms_elapsed: Some(elapsed_ms(start)),
        },
    };
    
    serde_json::to_string(&result).unwrap_or_else(|e| {
        format!(r#"{{"success":false,"error":"Serialization failed: {}"}}"#, e)
    })
}

/// Get current time in milliseconds (for WASM)
fn web_sys_time() -> f64 {
    #[cfg(feature = "wasm")]
    {
        js_sys::Date::now()
    }
    #[cfg(not(feature = "wasm"))]
    {
        0.0
    }
}

fn elapsed_ms(start: f64) -> u64 {
    #[cfg(feature = "wasm")]
    {
        (js_sys::Date::now() - start) as u64
    }
    #[cfg(not(feature = "wasm"))]
    {
        let _ = start;
        0
    }
}

fn run_analysis(request: AnalysisRequest, start: f64) -> AnalysisResponse {
    match run_analysis_inner(request) {
        Ok(results) => AnalysisResponse {
            success: true,
            error: None,
            results: Some(results),
            ms_elapsed: Some(elapsed_ms(start)),
        },
        Err(e) => AnalysisResponse {
            success: false,
            error: Some(e.to_string()),
            results: None,
            ms_elapsed: Some(elapsed_ms(start)),
        },
    }
}

fn run_analysis_inner(request: AnalysisRequest) -> Result<ResultsData, crate::error::FEAError> {
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

    // Add members
    for member in request.model.members {
        let mut m = Member::new(&member.i_node, &member.j_node, &member.material, &member.section);
        m.rotation = member.rotation;
        
        if let Some(ref releases) = member.releases {
            m.releases.i_node = [false, false, false, false, releases.i_node_ry, releases.i_node_rz];
            m.releases.j_node = [false, false, false, false, releases.j_node_ry, releases.j_node_rz];
        }
        
        model.add_member(&member.name, m)?;
    }

    // Add plates
    for plate in request.model.plates {
        let formulation = match plate.formulation.to_lowercase().as_str() {
            "mindlin" | "mindlin-reissner" | "thick" => crate::math::PlateFormulation::Mindlin,
            "dkmq" | "discrete-kirchhoff" => crate::math::PlateFormulation::DKMQ,
            _ => crate::math::PlateFormulation::Kirchhoff,
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

    // Add distributed loads
    for load in request.model.distributed_loads {
        let dir = match load.direction.to_uppercase().as_str() {
            "FX" => LoadDirection::FX,
            "FY" => LoadDirection::FY,
            "FZ" => LoadDirection::FZ,
            _ => LoadDirection::FY,
        };
        
        model.add_member_dist_load(
            &load.member,
            DistributedLoad::uniform(load.w1, dir, &load.case),
        )?;
    }

    // Add plate loads
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

        // Plate stresses
        for plate_name in model.plates.keys() {
            if let Ok(stress) = model.plate_stress(plate_name, combo) {
                plate_stresses.push(PlateStressResultData {
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
                plate_stresses.push(PlateStressResultData {
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

/// Get version information
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
