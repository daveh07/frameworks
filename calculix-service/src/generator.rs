use crate::models::{StructuralModel, SupportType};

pub struct CalculiXGenerator;

impl CalculiXGenerator {
    const KILO_TO_BASE: f64 = 1000.0;
    const GRAVITY: f64 = 9.81;

    pub fn new() -> Self {
        Self
    }

    fn to_newtons(value_kilo_newton: f64) -> f64 {
        value_kilo_newton * Self::KILO_TO_BASE
    }

    fn to_pascal(value_kilo_newton_per_m2: f64) -> f64 {
        value_kilo_newton_per_m2 * Self::KILO_TO_BASE
    }

    fn to_mass_density(value_kilo_newton_per_m3: f64) -> f64 {
        (value_kilo_newton_per_m3 * Self::KILO_TO_BASE) / Self::GRAVITY
    }

    /// Detect the dominant normal direction of shell elements
    fn detect_plate_normal(model: &StructuralModel) -> (f64, f64, f64) {
        if model.shells.is_empty() {
            return (0.0, 0.0, 1.0); // Default to Z
        }

        // Take first shell and compute its normal
        if let Some(shell) = model.shells.first() {
            if shell.node_ids.len() >= 3 {
                let n0 = &model.nodes[shell.node_ids[0]];
                let n1 = &model.nodes[shell.node_ids[1]];
                let n2 = &model.nodes[shell.node_ids[2]];

                // Vectors along shell edges
                let v1 = (n1.x - n0.x, n1.y - n0.y, n1.z - n0.z);
                let v2 = (n2.x - n0.x, n2.y - n0.y, n2.z - n0.z);

                // Cross product to get normal
                let nx = v1.1 * v2.2 - v1.2 * v2.1;
                let ny = v1.2 * v2.0 - v1.0 * v2.2;
                let nz = v1.0 * v2.1 - v1.1 * v2.0;

                // Normalize
                let mag = (nx*nx + ny*ny + nz*nz).sqrt();
                if mag > 1e-6 {
                    return (nx/mag, ny/mag, nz/mag);
                }
            }
        }

        (0.0, 0.0, 1.0) // Default to Z if can't compute
    }

    /// Get the DOF number (1=X, 2=Y, 3=Z) for the dominant normal direction
    fn get_normal_dof(normal: &(f64, f64, f64)) -> usize {
        let (nx, ny, nz) = normal;
        let abs_x = nx.abs();
        let abs_y = ny.abs();
        let abs_z = nz.abs();

        if abs_x > abs_y && abs_x > abs_z {
            1 // X-normal plate (YZ plane)
        } else if abs_y > abs_z {
            2 // Y-normal plate (XZ plane)
        } else {
            3 // Z-normal plate (XY plane)
        }
    }

    /// Compute beam orientation vector (local y-axis direction) that's perpendicular to the beam axis
    /// For CalculiX, the direction vector must NOT be parallel to the beam axis
    fn compute_beam_orientation(model: &StructuralModel) -> (f64, f64, f64) {
        if model.beams.is_empty() {
            return (0.0, 1.0, 0.0); // Default for horizontal beams
        }

        // Get the first beam to determine dominant direction
        if let Some(beam) = model.beams.first() {
            if beam.node_ids.len() >= 2 {
                let n0 = &model.nodes[beam.node_ids[0]];
                let n1 = &model.nodes[beam.node_ids[1]];

                // Beam direction vector
                let dx = n1.x - n0.x;
                let dy = n1.y - n0.y;
                let dz = n1.z - n0.z;

                let len = (dx*dx + dy*dy + dz*dz).sqrt();
                if len < 1e-10 {
                    return (0.0, 1.0, 0.0);
                }

                // Normalized beam direction
                let bx = dx / len;
                let by = dy / len;
                let bz = dz / len;

                // Find which global axis the beam is most aligned with
                let abs_x = bx.abs();
                let abs_y = by.abs();
                let abs_z = bz.abs();

                // Choose an orientation vector perpendicular to the beam axis
                // We need a vector that, when crossed with beam direction, gives a valid normal
                if abs_y > abs_x && abs_y > abs_z {
                    // Beam is mostly vertical (Y direction) - use X or Z for orientation
                    // Use global X direction
                    (1.0, 0.0, 0.0)
                } else if abs_x > abs_z {
                    // Beam is mostly along X - use Y (up) for orientation
                    (0.0, 1.0, 0.0)
                } else {
                    // Beam is mostly along Z - use Y (up) for orientation  
                    (0.0, 1.0, 0.0)
                }
            } else {
                (0.0, 1.0, 0.0)
            }
        } else {
            (0.0, 1.0, 0.0)
        }
    }

    pub fn generate_inp_file(&self, model: &StructuralModel) -> Result<String, GeneratorError> {
        let mut inp = String::new();

        if model.nodes.is_empty() {
            return Err(GeneratorError::GenerationError("Model has no nodes".to_string()));
        }

        // 1. Header
        inp.push_str("*HEADING\n");
        inp.push_str("CalculiX Analysis\n");

        // 2. Nodes
        inp.push_str("*NODE, NSET=NALL\n");
        for node in &model.nodes {
            // CalculiX nodes: ID, x, y, z (CalculiX uses 1-based indexing)
            inp.push_str(&format!("{}, {:.4}, {:.4}, {:.4}\n", node.id + 1, node.x, node.y, node.z));
        }

        // 3. Elements (Beams)
        // Using B32 (3-node quadratic beam) for better accuracy
        // B32 requires 3 nodes: start, end, and midpoint
        if !model.beams.is_empty() {
            // Check if beams have midpoint nodes (quadratic)
            let has_midpoint = model.beams.first().map_or(false, |b| b.node_ids.len() >= 3);
            
            if has_midpoint {
                inp.push_str("*ELEMENT, TYPE=B32, ELSET=EBEAMS\n");
                for beam in &model.beams {
                    if beam.node_ids.len() >= 3 {
                        // B32: Node1, Node2 (end), Node3 (midpoint)
                        // CalculiX B32 order: end1, end2, mid
                        inp.push_str(&format!("{}, {}, {}, {}\n", 
                            beam.id + 1, 
                            beam.node_ids[0] + 1, 
                            beam.node_ids[1] + 1, 
                            beam.node_ids[2] + 1));
                    }
                }
            } else {
                // Fallback to linear B31 if no midpoint nodes
                inp.push_str("*ELEMENT, TYPE=B31, ELSET=EBEAMS\n");
                for beam in &model.beams {
                    if beam.node_ids.len() >= 2 {
                        inp.push_str(&format!("{}, {}, {}\n", beam.id + 1, beam.node_ids[0] + 1, beam.node_ids[1] + 1));
                    }
                }
            }
        }

        // 4. Elements (Shells/Plates)
        // Support mixed element types: S8 (8-node quadratic), S4 (4-node linear), S3 (3-node triangle)
        // Ensure element IDs are globally unique across shell types so loads map correctly.
        if !model.shells.is_empty() {
            let mut s8_lines: Vec<String> = Vec::new();
            let mut s4_lines: Vec<String> = Vec::new();
            let mut s3_lines: Vec<String> = Vec::new();

            for (idx, shell) in model.shells.iter().enumerate() {
                let shell_id = 1000001 + idx; // stable, matches pressure_load element_ids and parser expectations

                if shell.is_quadratic || shell.node_ids.len() == 8 {
                    // S8 node ordering: n1..n4 corners CCW, n5..n8 midside CCW
                    s8_lines.push(format!(
                        "{}, {}, {}, {}, {}, {}, {}, {}, {}\n",
                        shell_id,
                        shell.node_ids[0] + 1,
                        shell.node_ids[1] + 1,
                        shell.node_ids[2] + 1,
                        shell.node_ids[3] + 1,
                        shell.node_ids[4] + 1,
                        shell.node_ids[5] + 1,
                        shell.node_ids[6] + 1,
                        shell.node_ids[7] + 1,
                    ));
                } else if shell.node_ids.len() == 4 {
                    s4_lines.push(format!(
                        "{}, {}, {}, {}, {}\n",
                        shell_id,
                        shell.node_ids[0] + 1,
                        shell.node_ids[1] + 1,
                        shell.node_ids[2] + 1,
                        shell.node_ids[3] + 1,
                    ));
                } else if shell.node_ids.len() == 3 {
                    s3_lines.push(format!(
                        "{}, {}, {}, {}\n",
                        shell_id,
                        shell.node_ids[0] + 1,
                        shell.node_ids[1] + 1,
                        shell.node_ids[2] + 1,
                    ));
                } else {
                    return Err(GeneratorError::GenerationError("Unsupported shell node count".to_string()));
                }
            }

            // Track which element sets have elements for the combined set
            let has_s8 = !s8_lines.is_empty();
            let has_s4 = !s4_lines.is_empty();
            let has_s3 = !s3_lines.is_empty();

            if has_s8 {
                inp.push_str("*ELEMENT, TYPE=S8, ELSET=ESHELLS_S8\n");
                for line in s8_lines { inp.push_str(&line); }
            }

            if has_s4 {
                inp.push_str("*ELEMENT, TYPE=S4, ELSET=ESHELLS_S4\n");
                for line in s4_lines { inp.push_str(&line); }
            }

            if has_s3 {
                inp.push_str("*ELEMENT, TYPE=S3, ELSET=ESHELLS_S3\n");
                for line in s3_lines { inp.push_str(&line); }
            }

            // Create combined element set for all shells
            inp.push_str("*ELSET, ELSET=ESHELLS\n");
            if has_s8 { inp.push_str("ESHELLS_S8,\n"); }
            if has_s4 { inp.push_str("ESHELLS_S4,\n"); }
            if has_s3 { inp.push_str("ESHELLS_S3,\n"); }
        }

        // 5. Materials
        inp.push_str("*MATERIAL, NAME=MATERIAL1\n");
        inp.push_str("*ELASTIC\n");
        // Young's Modulus, Poisson's Ratio
        let elastic_modulus = Self::to_pascal(model.material.elastic_modulus);
        let density = Self::to_mass_density(model.material.density);

        inp.push_str(&format!("{:.4}, {:.4}\n", elastic_modulus, model.material.poisson_ratio));
        inp.push_str("*DENSITY\n");
        inp.push_str(&format!("{:.4}\n", density));

        // 6. Sections
        // Beam Section
        if !model.beams.is_empty() {
            if let Some(first_beam) = model.beams.first() {
                match first_beam.section.section_type {
                    crate::models::SectionType::IBeam => {
                        // I-beam section: requires height, width, web thickness, flange thickness
                        // CalculiX I-beam: h1, h2, b, s, t1, t2 (symmetric I-beam uses h1=h2, t1=t2)
                        // where h1,h2 = web heights (half total less flanges), b = flange width,
                        // s = web thickness, t1,t2 = flange thicknesses
                        inp.push_str("*BEAM SECTION, ELSET=EBEAMS, MATERIAL=MATERIAL1, SECTION=BOX\n");
                        
                        // For now, use BOX section which is more stable in CalculiX
                        // BOX: a (height), b (width), t1, t2, t3, t4 (wall thicknesses)
                        let height = first_beam.section.height;
                        let width = first_beam.section.width;
                        let tf = first_beam.section.flange_thickness.unwrap_or(0.0108); // 310UB32 default: 10.8mm
                        let tw = first_beam.section.web_thickness.unwrap_or(0.0059);    // 310UB32 default: 5.9mm
                        
                        // BOX section parameters: a, b, t1, t2, t3, t4
                        // t1=bottom, t2=right, t3=top, t4=left
                        inp.push_str(&format!("{:.6}, {:.6}, {:.6}, {:.6}, {:.6}, {:.6}\n", 
                            height, width, tf, tw, tf, tw));
                    },
                    crate::models::SectionType::Circular => {
                        inp.push_str("*BEAM SECTION, ELSET=EBEAMS, MATERIAL=MATERIAL1, SECTION=CIRC\n");
                        // Radius
                        let radius = first_beam.section.width / 2.0;
                        inp.push_str(&format!("{:.6}\n", radius));
                    },
                    crate::models::SectionType::Rectangular => {
                        inp.push_str("*BEAM SECTION, ELSET=EBEAMS, MATERIAL=MATERIAL1, SECTION=RECT\n");
                        inp.push_str(&format!("{:.6}, {:.6}\n", first_beam.section.width, first_beam.section.height));
                    },
                }
            } else {
                // Default rectangular section
                inp.push_str("*BEAM SECTION, ELSET=EBEAMS, MATERIAL=MATERIAL1, SECTION=RECT\n");
                inp.push_str("0.1, 0.1\n");
            }
            // Direction vector for local y-axis (determines beam orientation)
            // Must be perpendicular to the beam axis - computed based on actual beam direction
            let beam_orientation = Self::compute_beam_orientation(model);
            inp.push_str(&format!("{:.1}, {:.1}, {:.1}\n", 
                beam_orientation.0, beam_orientation.1, beam_orientation.2));
        }

        // Shell Section
        if !model.shells.is_empty() {
            // Use 5 integration points through thickness for proper stress distribution
            // Section points 1=bottom, 3=middle, 5=top
            inp.push_str("*SHELL SECTION, ELSET=ESHELLS, MATERIAL=MATERIAL1\n");
            // Thickness, number of integration points through thickness
            if let Some(first_shell) = model.shells.first() {
                inp.push_str(&format!("{:.4}, 5\n", first_shell.thickness));
            } else {
                inp.push_str("0.2, 5\n");
            }
        }

        // 7. Boundary Conditions
        // For shell structures, detect plate orientation and apply proper boundary conditions
        let plate_normal = Self::detect_plate_normal(model);
        
        inp.push_str("*BOUNDARY\n");
        
        // For pinned supports on shells, we need to prevent rigid body motion while allowing bending
        let pinned_supports: Vec<_> = model.supports.iter()
            .filter(|s| s.constraint_type == SupportType::Pinned)
            .collect();
        
        for (idx, support) in model.supports.iter().enumerate() {
            match support.constraint_type {
                SupportType::Fixed => {
                    inp.push_str(&format!("{}, 1, 6, 0.0\n", support.node_id + 1));
                },
                SupportType::Pinned => {
                    if !model.shells.is_empty() {
                        // For shell/plate structures with pinned supports at corners:
                        // This creates a simply-supported condition where:
                        // - All corners are restrained in the normal (vertical) direction
                        // - Minimum in-plane constraints to prevent rigid body motion
                        let normal_dof = Self::get_normal_dof(&plate_normal);
                        
                        if pinned_supports.len() >= 3 {
                            // All supports: constrain normal direction (vertical for horizontal plates)
                            inp.push_str(&format!("{}, {}, {}, 0.0\n", support.node_id + 1, normal_dof, normal_dof));
                            
                            // Prevent rigid body motion with minimal additional constraints
                            if idx == 0 {
                                // First support: add one in-plane constraint (prevent translation in X)
                                let in_plane_dof1 = if normal_dof == 2 { 1 } else { 1 };
                                inp.push_str(&format!("{}, {}, {}, 0.0\n", support.node_id + 1, in_plane_dof1, in_plane_dof1));
                            } else if idx == 1 {
                                // Second support: add perpendicular in-plane constraint (prevent rotation about normal)
                                let in_plane_dof2 = if normal_dof == 2 { 3 } else { 2 };
                                inp.push_str(&format!("{}, {}, {}, 0.0\n", support.node_id + 1, in_plane_dof2, in_plane_dof2));
                            }
                            // Other supports: only normal constraint (already added above)
                        } else {
                            // Few supports: constrain all translations for stability
                            inp.push_str(&format!("{}, 1, 3, 0.0\n", support.node_id + 1));
                        }
                    } else {
                        // For beams/trusses: constrain all translations
                        inp.push_str(&format!("{}, 1, 3, 0.0\n", support.node_id + 1));
                    }
                },
                SupportType::RollerY => {
                    inp.push_str(&format!("{}, 2, 2, 0.0\n", support.node_id + 1));
                },
                SupportType::RollerX => {
                    inp.push_str(&format!("{}, 1, 1, 0.0\n", support.node_id + 1));
                },
                SupportType::RollerZ => {
                    inp.push_str(&format!("{}, 3, 3, 0.0\n", support.node_id + 1));
                },
            }
        }

        // 8. Steps and Loads
        inp.push_str("*STEP\n");
        inp.push_str("*STATIC\n");
        
        // Point Loads
        if !model.point_loads.is_empty() {
            inp.push_str("*CLOAD\n");
            for load in &model.point_loads {
                let fx = Self::to_newtons(load.fx);
                let fy = Self::to_newtons(load.fy);
                let fz = Self::to_newtons(load.fz);

                if fx.abs() > 1e-6 { inp.push_str(&format!("{}, 1, {:.4}\n", load.node_id + 1, fx)); }
                if fy.abs() > 1e-6 { inp.push_str(&format!("{}, 2, {:.4}\n", load.node_id + 1, fy)); }
                if fz.abs() > 1e-6 { inp.push_str(&format!("{}, 3, {:.4}\n", load.node_id + 1, fz)); }
            }
        }

        // Distributed Loads on Beams (UDL)
        if !model.distributed_loads.is_empty() {
            inp.push_str("*DLOAD\n");
            for load in &model.distributed_loads {
                for elem_id in &load.element_ids {
                    // Beam element ID (1-based)
                    let beam_id = elem_id + 1;
                    
                    match &load.load_type {
                        crate::models::LoadType::Uniform { value, direction } => {
                            // Convert from kN/m to N/m
                            let load_value = Self::to_newtons(*value);
                            
                            // For beams in CalculiX with local y-axis pointing up (0,1,0):
                            // P1 = load in local y direction (vertical for horizontal beams)
                            // P2 = load in local z direction (horizontal perpendicular to beam)
                            // Negative value = downward (in negative local y direction)
                            match direction {
                                crate::models::LoadDirection::X => {
                                    // Axial load along beam - not directly supported as DLOAD
                                    // Would need *CLOAD at nodes or body force
                                    tracing::warn!("Axial distributed loads not yet supported, skipping");
                                },
                                crate::models::LoadDirection::Y => {
                                    // Global Y direction (typically gravity = negative Y)
                                    // With local y = (0,1,0), P1 acts in global Y
                                    // Load value should be negative for downward loads
                                    inp.push_str(&format!("{}, P1, {:.6}\n", beam_id, load_value));
                                },
                                crate::models::LoadDirection::Z => {
                                    // Global Z direction - use P2 (local z)
                                    inp.push_str(&format!("{}, P2, {:.6}\n", beam_id, load_value));
                                },
                            }
                        },
                        crate::models::LoadType::Gravity { g } => {
                            // Apply gravity load using GRAV
                            // GRAV requires magnitude and direction components
                            // Gravity is in -Y direction
                            inp.push_str(&format!("{}, GRAV, {:.6}, 0.0, -1.0, 0.0\n", beam_id, g));
                        },
                    }
                }
            }
        }

        // Pressure Loads (on Shells)
        if !model.pressure_loads.is_empty() {
            // Continue with *DLOAD if not already started, or add to existing
            if model.distributed_loads.is_empty() {
                inp.push_str("*DLOAD\n");
            }
            for load in &model.pressure_loads {
                for elem_id in &load.element_ids {
                    // Pn is pressure normal to face n. For shells, face 1 is top, face 2 is bottom?
                    // Or just P for pressure? CalculiX manual says P for shells.
                    // Positive pressure acts in the direction of the normal.
                    // Apply offset for shell elements
                    let shell_id = elem_id + 1000001;
                    let pressure = Self::to_pascal(load.magnitude);
                    if pressure.abs() > 1e-6 {
                        inp.push_str(&format!("{}, P, {:.4}\n", shell_id, pressure));
                    }
                }
            }
        }

        // Output requests
        inp.push_str("*NODE PRINT, NSET=NALL\n");
        inp.push_str("U, RF\n"); 
        
        if !model.beams.is_empty() {
            // Request beam stresses (CalculiX computes section forces from stresses)
            inp.push_str("*EL PRINT, ELSET=EBEAMS\n");
            inp.push_str("S\n");   // Stresses at integration points
        }
        
        if !model.shells.is_empty() {
            // Request shell stresses at integration points
            inp.push_str("*EL PRINT, ELSET=ESHELLS\n");
            inp.push_str("S\n");
        }

        inp.push_str("*END STEP\n");

        Ok(inp)
    }
}
#[derive(Debug, thiserror::Error)]
pub enum GeneratorError {
    #[error("Generation error: {0}")]
    GenerationError(String),
}
