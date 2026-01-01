use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;
use uuid::Uuid;

use crate::models::{AnalysisResults, StructuralModel, NodeDisplacement, NodeReaction, ElementStress, BeamForces};

pub struct CalculiXExecutor {
    work_dir: PathBuf,
}

impl CalculiXExecutor {
    pub fn new() -> Self {
        Self {
            work_dir: std::env::temp_dir().join("calculix_work"),
        }
    }

    pub async fn execute(
        &mut self,
        model: &StructuralModel,
        inp_content: &str,
    ) -> Result<AnalysisResults, ExecutorError> {
        // Create a unique temporary directory for this analysis
        let analysis_id = Uuid::new_v4();
        let temp_dir = TempDir::new().map_err(|e| ExecutorError::IoError(e.to_string()))?;
        let work_path = temp_dir.path();

        tracing::info!("Starting analysis {} in {:?}", analysis_id, work_path);

        // Write the .inp file
        let inp_path = work_path.join("analysis.inp");
        fs::write(&inp_path, inp_content)
            .map_err(|e| ExecutorError::IoError(format!("Failed to write .inp file: {}", e)))?;

        Self::maybe_export_debug_file(&inp_path, &analysis_id, "inp");

        // Run CalculiX (ccx)
        // Note: ccx expects the job name WITHOUT extension
        let job_name = "analysis";
        let ccx_path = std::env::var("CALCULIX_PATH").unwrap_or_else(|_| "ccx".to_string());

        tracing::info!("Running command: {} {}", ccx_path, job_name);

        let output = Command::new(&ccx_path)
            .arg(job_name)
            .current_dir(work_path)
            .output()
            .map_err(|e| ExecutorError::ExecutionError(format!("Failed to execute ccx: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            tracing::error!("CalculiX failed. Stderr: {}\nStdout: {}", stderr, stdout);
            return Err(ExecutorError::AnalysisFailed(format!(
                "CalculiX exited with status {}. Check logs.",
                output.status
            )));
        }

        // Parse results from the .dat file
        let results = self.parse_dat_results(work_path, model)?;

        // Export the resulting .dat for debugging if requested
        let dat_path = work_path.join("analysis.dat");
        if dat_path.exists() {
            Self::maybe_export_debug_file(&dat_path, &analysis_id, "dat");
        }

        Ok(results)
    }

    fn maybe_export_debug_file(path: &Path, analysis_id: &Uuid, extension: &str) {
        if let Ok(dest_dir) = std::env::var("CALCULIX_DEBUG_EXPORT") {
            let dest_path = PathBuf::from(dest_dir);
            if let Err(err) = fs::create_dir_all(&dest_path) {
                tracing::warn!("Failed to create debug export directory {:?}: {}", dest_path, err);
                return;
            }

            let file_name = format!("analysis_{}.{}", analysis_id, extension);
            let dest_file = dest_path.join(file_name);
            if let Err(err) = fs::copy(path, &dest_file) {
                tracing::warn!("Failed to export debug file {:?}: {}", dest_file, err);
            } else {
                tracing::info!("Exported debug file to {:?}", dest_file);
            }
        }
    }

    fn parse_dat_results(
        &self,
        work_path: &std::path::Path,
        model: &StructuralModel,
    ) -> Result<AnalysisResults, ExecutorError> {
        let dat_path = work_path.join("analysis.dat");
        if !dat_path.exists() {
            return Err(ExecutorError::AnalysisFailed("No .dat file generated".to_string()));
        }

        let content = fs::read_to_string(&dat_path)
            .map_err(|e| ExecutorError::IoError(format!("Failed to read .dat file: {}", e)))?;

        // DEBUG: Print first 200 lines of .dat file to logs
        tracing::info!("--- .dat file content (first 200 lines) ---");
        for (i, line) in content.lines().take(200).enumerate() {
            tracing::info!("{:03}: {}", i + 1, line);
        }
        tracing::info!("--- end of .dat preview ---");

        let mut results = AnalysisResults {
            displacements: Vec::new(),
            reactions: Vec::new(),
            stresses: Vec::new(),
            beam_forces: Vec::new(),
            max_displacement: 0.0,
            max_stress: 0.0,
            max_beam_stress: 0.0,
        };

        // Calculate max original node ID to distinguish top/bottom nodes
        // CalculiX uses 1-based indexing, so we add 1 to our 0-based IDs
        let max_original_id = model.nodes.iter().map(|n| n.id + 1).max().unwrap_or(0);
        tracing::info!("Max original node ID: {}", max_original_id);

        // Intermediate storage for element stresses: CalculiX Element ID -> Vec<ElementStress>
        let mut element_stresses: std::collections::HashMap<usize, Vec<crate::models::ElementStress>> = std::collections::HashMap::new();
        let mut seen_node_ids: std::collections::HashSet<usize> = std::collections::HashSet::new();

        let mut current_section = ""; // "displacements", "forces", "stresses"

        for line in content.lines() {
            let line_lower = line.to_lowercase();
            
            // Detect sections
            if line_lower.contains("displacements") && line_lower.contains("vx") {
                current_section = "displacements";
                tracing::info!("Found displacements section: {}", line);
                seen_node_ids.clear(); // Reset for new displacement section
                continue;
            } else if line_lower.contains("total forces") && line_lower.contains("fx") {
                current_section = "forces";
                tracing::info!("Found forces section: {}", line);
                continue;
            } else if line_lower.contains("stresses") {
                current_section = "stresses";
                tracing::info!("Found stresses section: {}", line);
                continue;
            }

            // Skip headers or empty lines
            if line.trim().is_empty() {
                continue;
            }
            
            // Skip header lines that contain text
            if line.trim().chars().next().map_or(false, |c| !c.is_numeric() && c != '-') {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            
            match current_section {
                "displacements" => {
                    // Format: node_id dx dy dz
                    if parts.len() >= 4 {
                        if let (Ok(id), Ok(dx), Ok(dy), Ok(dz)) = (
                            parts[0].parse::<usize>(),
                            parts[1].parse::<f64>(),
                            parts[2].parse::<f64>(),
                            parts[3].parse::<f64>(),
                        ) {
                            // Skip duplicate node IDs (CalculiX may output displacements multiple times)
                            if seen_node_ids.contains(&id) {
                                continue;
                            }
                            seen_node_ids.insert(id);

                            let disp_mag = (dx*dx + dy*dy + dz*dz).sqrt();
                            if disp_mag > results.max_displacement {
                                results.max_displacement = disp_mag;
                            }

                            results.displacements.push(NodeDisplacement {
                                node_id: id - 1, // Convert from 1-based to 0-based
                                dx, dy, dz,
                                rx: 0.0, ry: 0.0, rz: 0.0,
                            });
                        }
                    }
                },
                "forces" => {
                    // Format: node_id fx fy fz
                    if parts.len() >= 4 {
                        if let (Ok(id), Ok(fx), Ok(fy), Ok(fz)) = (
                            parts[0].parse::<usize>(),
                            parts[1].parse::<f64>(),
                            parts[2].parse::<f64>(),
                            parts[3].parse::<f64>(),
                        ) {
                            results.reactions.push(NodeReaction {
                                node_id: id - 1, // Convert from 1-based to 0-based
                                fx, fy, fz,
                                mx: 0.0, my: 0.0, mz: 0.0,
                            });
                        }
                    }
                },
                "stresses" => {
                    // Format for *EL PRINT: element_id int_pt sxx syy szz sxy syz szx
                    
                    if parts.len() < 8 {
                        continue;
                    }
                    
                    if let (Ok(elem_id), Ok(int_pt)) = (parts[0].parse::<usize>(), parts[1].parse::<usize>()) {
                        // Parse stress components
                        let mut numeric_parts = vec![];
                        for part in &parts[2..] {
                            if let Ok(val) = part.parse::<f64>() {
                                numeric_parts.push(val);
                            } else {
                                break;
                            }
                        }
                        
                        if numeric_parts.len() >= 6 {
                            let sxx = numeric_parts[0];
                            let syy = numeric_parts[1];
                            let szz = numeric_parts[2];
                            let sxy = numeric_parts[3];
                            let syz = numeric_parts[4];
                            let szx = numeric_parts[5];
                            
                            // Von Mises stress (always positive magnitude)
                            let vm = (0.5 * ((sxx-syy).powi(2) + (syy-szz).powi(2) + (szz-sxx).powi(2) + 6.0*(sxy.powi(2) + syz.powi(2) + szx.powi(2)))).sqrt();
                            
                            // Check if this is a beam element (ID < 1000001) or shell element
                            if elem_id < 1000001 {
                                // Beam element - store von Mises stress directly
                                let beam_idx = elem_id - 1; // 0-based index
                                
                                // Track maximum stress for this beam
                                // Beams output stresses at multiple integration points
                                let existing = results.beam_forces.iter_mut().find(|bf| bf.element_id == beam_idx);
                                if let Some(bf) = existing {
                                    // Update if this stress is higher
                                    if vm > bf.combined_stress {
                                        bf.combined_stress = vm;
                                        bf.bending_stress = vm; // For beam stresses, use VM as combined
                                    }
                                } else {
                                    // First stress entry for this beam
                                    results.beam_forces.push(BeamForces {
                                        element_id: beam_idx,
                                        axial_force: sxx, // Axial stress (approximate)
                                        shear_y: sxy,
                                        shear_z: szx,
                                        torsion: 0.0,
                                        moment_y: 0.0,
                                        moment_z: 0.0,
                                        combined_stress: vm,
                                        axial_stress: sxx,
                                        bending_stress: vm,
                                    });
                                }
                                
                                // Update max beam stress
                                if vm > results.max_beam_stress {
                                    results.max_beam_stress = vm;
                                }
                                
                                tracing::debug!("Beam {} int_pt {}: VM={:.2}MPa, sxx={:.2}MPa", 
                                    beam_idx, int_pt, vm / 1e6, sxx / 1e6);
                            } else {
                                // Shell element - store for later processing
                                element_stresses.entry(elem_id)
                                    .or_insert_with(Vec::new)
                                    .push(ElementStress {
                                        element_id: elem_id,
                                        integration_point: int_pt,
                                        von_mises: vm,
                                        sxx, syy, szz, sxy, syz, szx,
                                    });
                            }
                        }
                    }
                },
                _ => {}
            }
        }

        tracing::info!("Parsed {} nodal stress entries from .dat file", element_stresses.len());
        
        // DEBUG: Log some details about parsed stresses
        if element_stresses.is_empty() {
            tracing::warn!("NO STRESSES FOUND - checking .dat file sections");
        } else {
            tracing::info!("Sample nodal stresses: {:?}", element_stresses.iter().take(2).collect::<Vec<_>>());
            // Log layer distribution for first few nodes
            if let Some(stresses) = element_stresses.get(&1) {
                tracing::info!("Node 1 has {} layers: {:?}",
                    stresses.len(),
                    stresses.iter().map(|s| (s.integration_point, format!("{:.2} MPa", s.von_mises/1e6))).collect::<Vec<_>>()
                );
            }
        }

        // Post-process: Map Element Stresses to Nodes
        // We have element_stresses: ElementID -> Vec<ElementStress>
        // We need to map these to nodes.
        
        #[derive(Default)]
        struct NodeStressAccumulator {
            // Store stress components so von Mises can be computed from averaged components.
            sxx_bottom_sum: f64,
            syy_bottom_sum: f64,
            szz_bottom_sum: f64,
            sxy_bottom_sum: f64,
            syz_bottom_sum: f64,
            szx_bottom_sum: f64,
            bottom_count: usize,

            sxx_middle_sum: f64,
            syy_middle_sum: f64,
            szz_middle_sum: f64,
            sxy_middle_sum: f64,
            syz_middle_sum: f64,
            szx_middle_sum: f64,
            middle_count: usize,

            sxx_top_sum: f64,
            syy_top_sum: f64,
            szz_top_sum: f64,
            sxy_top_sum: f64,
            syz_top_sum: f64,
            szx_top_sum: f64,
            top_count: usize,
        }
        
        let mut node_stress_map: std::collections::HashMap<usize, NodeStressAccumulator> = std::collections::HashMap::new();

        tracing::info!("Processing {} element stress entries", element_stresses.len());
        
        for (elem_id, stresses) in &element_stresses {
            // Infer section-point grouping.
            // If stresses are printed for 5 section points, max_int_pt is often divisible by 5
            // (e.g., n_plane * 5). We'll then treat:
            //   bottom = section point 1
            //   middle = section point 3
            //   top    = section point 5
            // Otherwise, fall back to 2-surface grouping (split in half).
            let max_int_pt = stresses.iter().map(|s| s.integration_point).max().unwrap_or(0);
            if max_int_pt == 0 {
                continue;
            }

            let (section_points, n_plane) = if max_int_pt % 5 == 0 {
                (5usize, max_int_pt / 5)
            } else if max_int_pt % 2 == 0 {
                (2usize, max_int_pt / 2)
            } else {
                (2usize, max_int_pt / 2)
            };

            let mut bottom_sxx = 0.0; let mut bottom_syy = 0.0; let mut bottom_szz = 0.0;
            let mut bottom_sxy = 0.0; let mut bottom_syz = 0.0; let mut bottom_szx = 0.0;
            let mut bottom_count = 0usize;

            let mut middle_sxx = 0.0; let mut middle_syy = 0.0; let mut middle_szz = 0.0;
            let mut middle_sxy = 0.0; let mut middle_syz = 0.0; let mut middle_szx = 0.0;
            let mut middle_count = 0usize;

            let mut top_sxx = 0.0; let mut top_syy = 0.0; let mut top_szz = 0.0;
            let mut top_sxy = 0.0; let mut top_syz = 0.0; let mut top_szx = 0.0;
            let mut top_count = 0usize;

            // 1-based integration point indices
            let bottom_start = 1usize;
            let bottom_end = n_plane.max(1);
            let middle_start = 2 * n_plane + 1;
            let middle_end = 3 * n_plane;
            let top_start = (section_points - 1) * n_plane + 1;
            let top_end = section_points * n_plane;

            for s in stresses {
                let ip = s.integration_point;
                if ip >= bottom_start && ip <= bottom_end {
                    bottom_sxx += s.sxx; bottom_syy += s.syy; bottom_szz += s.szz;
                    bottom_sxy += s.sxy; bottom_syz += s.syz; bottom_szx += s.szx;
                    bottom_count += 1;
                } else if section_points == 5 && ip >= middle_start && ip <= middle_end {
                    middle_sxx += s.sxx; middle_syy += s.syy; middle_szz += s.szz;
                    middle_sxy += s.sxy; middle_syz += s.syz; middle_szx += s.szx;
                    middle_count += 1;
                } else if ip >= top_start && ip <= top_end {
                    top_sxx += s.sxx; top_syy += s.syy; top_szz += s.szz;
                    top_sxy += s.sxy; top_syz += s.syz; top_szx += s.szx;
                    top_count += 1;
                }
            }

            let bc = bottom_count.max(1) as f64;
            let mc = middle_count.max(1) as f64;
            let tc = top_count.max(1) as f64;
            
            // Map to Nodes
            // Shell IDs start at 1000001. Index = ID - 1000001.
            if *elem_id >= 1000001 {
                let shell_idx = elem_id - 1000001;
                if let Some(shell) = model.shells.get(shell_idx) {
                    for &node_id in &shell.node_ids {
                        let accum = node_stress_map.entry(node_id).or_default();
                        accum.sxx_bottom_sum += bottom_sxx / bc;
                        accum.syy_bottom_sum += bottom_syy / bc;
                        accum.szz_bottom_sum += bottom_szz / bc;
                        accum.sxy_bottom_sum += bottom_sxy / bc;
                        accum.syz_bottom_sum += bottom_syz / bc;
                        accum.szx_bottom_sum += bottom_szx / bc;
                        accum.bottom_count += 1;

                        if section_points == 5 && middle_count > 0 {
                            accum.sxx_middle_sum += middle_sxx / mc;
                            accum.syy_middle_sum += middle_syy / mc;
                            accum.szz_middle_sum += middle_szz / mc;
                            accum.sxy_middle_sum += middle_sxy / mc;
                            accum.syz_middle_sum += middle_syz / mc;
                            accum.szx_middle_sum += middle_szx / mc;
                            accum.middle_count += 1;
                        }

                        accum.sxx_top_sum += top_sxx / tc;
                        accum.syy_top_sum += top_syy / tc;
                        accum.szz_top_sum += top_szz / tc;
                        accum.sxy_top_sum += top_sxy / tc;
                        accum.syz_top_sum += top_syz / tc;
                        accum.szx_top_sum += top_szx / tc;
                        accum.top_count += 1;
                    }
                }
            }
        }

        tracing::info!("Node stress map created: {}", node_stress_map.len());
        
        // Helper function to calculate von Mises from stress components
        fn calc_von_mises(sxx: f64, syy: f64, szz: f64, sxy: f64, syz: f64, szx: f64) -> f64 {
            (0.5 * ((sxx-syy).powi(2) + (syy-szz).powi(2) + (szz-sxx).powi(2) 
                + 6.0*(sxy.powi(2) + syz.powi(2) + szx.powi(2)))).sqrt()
        }
        
        // Build node stress results
        let mut sample_count = 0;
        for (node_id, accum) in node_stress_map {
            let bc = accum.bottom_count.max(1) as f64;
            let tc = accum.top_count.max(1) as f64;

            let bottom_sxx = accum.sxx_bottom_sum / bc;
            let bottom_syy = accum.syy_bottom_sum / bc;
            let bottom_szz = accum.szz_bottom_sum / bc;
            let bottom_sxy = accum.sxy_bottom_sum / bc;
            let bottom_syz = accum.syz_bottom_sum / bc;
            let bottom_szx = accum.szx_bottom_sum / bc;

            let top_sxx = accum.sxx_top_sum / tc;
            let top_syy = accum.syy_top_sum / tc;
            let top_szz = accum.szz_top_sum / tc;
            let top_sxy = accum.sxy_top_sum / tc;
            let top_syz = accum.syz_top_sum / tc;
            let top_szx = accum.szx_top_sum / tc;

            // Von Mises is always non-negative.
            let vm_bottom = if accum.bottom_count > 0 {
                Some(calc_von_mises(bottom_sxx, bottom_syy, bottom_szz, bottom_sxy, bottom_syz, bottom_szx))
            } else {
                None
            };
            let vm_top = if accum.top_count > 0 {
                Some(calc_von_mises(top_sxx, top_syy, top_szz, top_sxy, top_syz, top_szx))
            } else {
                None
            };

            // Mid-plane: prefer explicit middle section-point data; else interpolate components.
            let vm_middle = if accum.middle_count > 0 {
                let mc = accum.middle_count as f64;
                let mid_sxx = accum.sxx_middle_sum / mc;
                let mid_syy = accum.syy_middle_sum / mc;
                let mid_szz = accum.szz_middle_sum / mc;
                let mid_sxy = accum.sxy_middle_sum / mc;
                let mid_syz = accum.syz_middle_sum / mc;
                let mid_szx = accum.szx_middle_sum / mc;
                calc_von_mises(mid_sxx, mid_syy, mid_szz, mid_sxy, mid_syz, mid_szx)
            } else {
                let mid_sxx = 0.5 * (bottom_sxx + top_sxx);
                let mid_syy = 0.5 * (bottom_syy + top_syy);
                let mid_szz = 0.5 * (bottom_szz + top_szz);
                let mid_sxy = 0.5 * (bottom_sxy + top_sxy);
                let mid_syz = 0.5 * (bottom_syz + top_syz);
                let mid_szx = 0.5 * (bottom_szx + top_szx);
                calc_von_mises(mid_sxx, mid_syy, mid_szz, mid_sxy, mid_syz, mid_szx)
            };
            
            // Log sample stresses to verify top/bottom/middle differentiation
            if sample_count < 5 {
                tracing::info!("Node {}: bottom={:.2} MPa, middle={:.2} MPa, top={:.2} MPa", 
                    node_id,
                    vm_bottom.unwrap_or(0.0) / 1e6,
                    vm_middle / 1e6,
                    vm_top.unwrap_or(0.0) / 1e6
                );
                sample_count += 1;
            }
            
            // Update max_stress using maximum across all surfaces
            let max_at_node = [Some(vm_middle), vm_top, vm_bottom]
                .iter()
                .filter_map(|&v| v)
                .map(|v| v.abs())
                .max_by(|a, b| a.partial_cmp(b).unwrap())
                .unwrap_or(vm_middle.abs());
            
            if max_at_node > results.max_stress {
                results.max_stress = max_at_node;
            }

            results.stresses.push(crate::models::NodeStress {
                node_id,
                von_mises: vm_middle,  // Mid-plane von Mises (from interpolated components)
                von_mises_top: vm_top,
                von_mises_bottom: vm_bottom,
                sxx: None, syy: None, szz: None, sxy: None,
            });
        }
        
        tracing::info!("Added {} node stresses to results (max_stress: {:.2})", results.stresses.len(), results.max_stress);

        Ok(results)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ExecutorError {
    #[error("IO error: {0}")]
    IoError(String),
    #[error("Execution error: {0}")]
    ExecutionError(String),
    #[error("Analysis failed: {0}")]
    AnalysisFailed(String),
    #[error("Parsing error: {0}")]
    ParsingError(String),
}
