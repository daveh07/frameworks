//! FE Model - Main structural model container

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use crate::analysis::{AnalysisOptions, AnalysisType};
use crate::elements::{Material, Member, Node, Plate, Quad, Section, Support};
use crate::error::{FEAError, FEAResult};
use crate::loads::{DistributedLoad, LoadCombination, NodeLoad, PlateLoad, PointLoad};
use crate::math::{self, Mat, Vec as FEVec};
use crate::results::{AnalysisSummary, MemberForces, NodeDisplacement, Reactions};

/// The main 3D finite element model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FEModel {
    /// Nodes in the model
    pub nodes: HashMap<String, Node>,
    /// Materials in the model
    pub materials: HashMap<String, Material>,
    /// Sections in the model
    pub sections: HashMap<String, Section>,
    /// Members (frame elements) in the model
    pub members: HashMap<String, Member>,
    /// Plates (rectangular shell elements)
    pub plates: HashMap<String, Plate>,
    /// Quads (general quadrilateral shell elements)
    pub quads: HashMap<String, Quad>,
    /// Support conditions at nodes
    pub supports: HashMap<String, Support>,
    /// Node loads
    pub node_loads: HashMap<String, Vec<NodeLoad>>,
    /// Member point loads
    pub member_point_loads: HashMap<String, Vec<PointLoad>>,
    /// Member distributed loads
    pub member_dist_loads: HashMap<String, Vec<DistributedLoad>>,
    /// Plate/quad pressure loads
    pub plate_loads: HashMap<String, Vec<PlateLoad>>,
    /// Load combinations
    pub load_combos: HashMap<String, LoadCombination>,
    
    /// Analysis solution status
    #[serde(skip)]
    solution: Option<AnalysisType>,
}

impl Default for FEModel {
    fn default() -> Self {
        Self::new()
    }
}

impl FEModel {
    /// Create a new empty model
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            materials: HashMap::new(),
            sections: HashMap::new(),
            members: HashMap::new(),
            plates: HashMap::new(),
            quads: HashMap::new(),
            supports: HashMap::new(),
            node_loads: HashMap::new(),
            member_point_loads: HashMap::new(),
            member_dist_loads: HashMap::new(),
            plate_loads: HashMap::new(),
            load_combos: HashMap::new(),
            solution: None,
        }
    }

    // ========================
    // Model Building Methods
    // ========================

    /// Add a node to the model
    pub fn add_node(&mut self, name: &str, node: Node) -> FEAResult<()> {
        if self.nodes.contains_key(name) {
            return Err(FEAError::DuplicateName(name.to_string()));
        }
        self.nodes.insert(name.to_string(), node);
        self.solution = None;
        Ok(())
    }

    /// Add a material to the model
    pub fn add_material(&mut self, name: &str, material: Material) -> FEAResult<()> {
        if self.materials.contains_key(name) {
            return Err(FEAError::DuplicateName(name.to_string()));
        }
        self.materials.insert(name.to_string(), material);
        Ok(())
    }

    /// Add a section to the model
    pub fn add_section(&mut self, name: &str, section: Section) -> FEAResult<()> {
        if self.sections.contains_key(name) {
            return Err(FEAError::DuplicateName(name.to_string()));
        }
        self.sections.insert(name.to_string(), section);
        Ok(())
    }

    /// Add a member to the model
    pub fn add_member(&mut self, name: &str, member: Member) -> FEAResult<()> {
        // Validate nodes exist
        if !self.nodes.contains_key(&member.i_node) {
            return Err(FEAError::NodeNotFound(member.i_node.clone()));
        }
        if !self.nodes.contains_key(&member.j_node) {
            return Err(FEAError::NodeNotFound(member.j_node.clone()));
        }
        if !self.materials.contains_key(&member.material) {
            return Err(FEAError::MaterialNotFound(member.material.clone()));
        }
        if !self.sections.contains_key(&member.section) {
            return Err(FEAError::SectionNotFound(member.section.clone()));
        }
        if self.members.contains_key(name) {
            return Err(FEAError::DuplicateName(name.to_string()));
        }
        
        self.members.insert(name.to_string(), member);
        self.solution = None;
        Ok(())
    }

    /// Add a plate element to the model
    pub fn add_plate(&mut self, name: &str, plate: Plate) -> FEAResult<()> {
        // Validate nodes exist
        for node_name in [&plate.i_node, &plate.j_node, &plate.m_node, &plate.n_node] {
            if !self.nodes.contains_key(node_name) {
                return Err(FEAError::NodeNotFound(node_name.clone()));
            }
        }
        if !self.materials.contains_key(&plate.material) {
            return Err(FEAError::MaterialNotFound(plate.material.clone()));
        }
        if self.plates.contains_key(name) {
            return Err(FEAError::DuplicateName(name.to_string()));
        }
        
        self.plates.insert(name.to_string(), plate);
        self.solution = None;
        Ok(())
    }

    /// Add a quad element to the model
    pub fn add_quad(&mut self, name: &str, quad: Quad) -> FEAResult<()> {
        for node_name in [&quad.i_node, &quad.j_node, &quad.m_node, &quad.n_node] {
            if !self.nodes.contains_key(node_name) {
                return Err(FEAError::NodeNotFound(node_name.clone()));
            }
        }
        if !self.materials.contains_key(&quad.material) {
            return Err(FEAError::MaterialNotFound(quad.material.clone()));
        }
        if self.quads.contains_key(name) {
            return Err(FEAError::DuplicateName(name.to_string()));
        }
        
        self.quads.insert(name.to_string(), quad);
        self.solution = None;
        Ok(())
    }

    /// Add a support condition
    pub fn add_support(&mut self, node_name: &str, support: Support) -> FEAResult<()> {
        if !self.nodes.contains_key(node_name) {
            return Err(FEAError::NodeNotFound(node_name.to_string()));
        }
        self.supports.insert(node_name.to_string(), support);
        self.solution = None;
        Ok(())
    }

    /// Add a node load
    pub fn add_node_load(&mut self, node_name: &str, load: NodeLoad) -> FEAResult<()> {
        if !self.nodes.contains_key(node_name) {
            return Err(FEAError::NodeNotFound(node_name.to_string()));
        }
        self.node_loads
            .entry(node_name.to_string())
            .or_default()
            .push(load);
        self.solution = None;
        Ok(())
    }

    /// Add a point load to a member
    pub fn add_member_point_load(&mut self, member_name: &str, load: PointLoad) -> FEAResult<()> {
        if !self.members.contains_key(member_name) {
            return Err(FEAError::MemberNotFound(member_name.to_string()));
        }
        self.member_point_loads
            .entry(member_name.to_string())
            .or_default()
            .push(load);
        self.solution = None;
        Ok(())
    }

    /// Add a distributed load to a member
    pub fn add_member_dist_load(&mut self, member_name: &str, load: DistributedLoad) -> FEAResult<()> {
        if !self.members.contains_key(member_name) {
            return Err(FEAError::MemberNotFound(member_name.to_string()));
        }
        self.member_dist_loads
            .entry(member_name.to_string())
            .or_default()
            .push(load);
        self.solution = None;
        Ok(())
    }

    /// Add a pressure load to a plate
    pub fn add_plate_load(&mut self, plate_name: &str, load: PlateLoad) -> FEAResult<()> {
        if !self.plates.contains_key(plate_name) && !self.quads.contains_key(plate_name) {
            return Err(FEAError::PlateNotFound(plate_name.to_string()));
        }
        self.plate_loads
            .entry(plate_name.to_string())
            .or_default()
            .push(load);
        self.solution = None;
        Ok(())
    }

    /// Add a load combination
    pub fn add_load_combo(&mut self, combo: LoadCombination) -> FEAResult<()> {
        let name = combo.name.clone();
        if self.load_combos.contains_key(&name) {
            return Err(FEAError::DuplicateName(name));
        }
        self.load_combos.insert(name, combo);
        self.solution = None;
        Ok(())
    }

    // ========================
    // Analysis Methods
    // ========================

    /// Run linear static analysis
    pub fn analyze_linear(&mut self) -> FEAResult<()> {
        self.analyze(AnalysisOptions::linear())
    }

    /// Run P-Delta (second order) analysis
    pub fn analyze_p_delta(&mut self) -> FEAResult<()> {
        self.analyze(AnalysisOptions::p_delta())
    }

    /// Run analysis with custom options
    pub fn analyze(&mut self, options: AnalysisOptions) -> FEAResult<()> {
        // Ensure at least one load combination exists
        if self.load_combos.is_empty() {
            self.load_combos.insert(
                "Combo 1".to_string(),
                LoadCombination::single("Combo 1", "Case 1"),
            );
        }

        // Prepare the model
        self.prepare_model()?;

        // Build global stiffness matrix and load vector
        let (k_global, dof_map) = self.build_global_stiffness()?;
        
        // Analyze each load combination
        let combo_names: Vec<String> = self.load_combos.keys().cloned().collect();
        
        for combo_name in &combo_names {
            let combo = self.load_combos.get(combo_name).unwrap().clone();
            
            // Build load vector for this combination
            let p_global = self.build_load_vector(&combo, &dof_map)?;
            
            // Partition and solve based on analysis type
            match options.analysis_type {
                AnalysisType::Linear => {
                    self.solve_linear(&k_global, &p_global, &dof_map, combo_name)?;
                }
                AnalysisType::PDelta => {
                    self.solve_p_delta(&k_global, &p_global, &dof_map, combo_name, &options)?;
                }
                _ => {
                    return Err(FEAError::AnalysisFailed(
                        "Analysis type not yet implemented".to_string(),
                    ));
                }
            }
            
            // Calculate member forces
            self.calculate_member_forces(combo_name)?;
            
            // Calculate reactions
            self.calculate_reactions(combo_name, &dof_map)?;
        }

        self.solution = Some(options.analysis_type);
        Ok(())
    }

    /// Prepare model for analysis (assign IDs, calculate lengths, etc.)
    fn prepare_model(&mut self) -> FEAResult<()> {
        // Assign node IDs
        for (i, node) in self.nodes.values_mut().enumerate() {
            node.id = Some(i);
        }

        // Calculate member lengths
        for member in self.members.values_mut() {
            let i_node = self.nodes.get(&member.i_node).unwrap();
            let j_node = self.nodes.get(&member.j_node).unwrap();
            let length = i_node.distance_to(j_node);
            
            if length < 1e-10 {
                return Err(FEAError::InvalidGeometry(format!(
                    "Member has zero length: i={}, j={}",
                    member.i_node, member.j_node
                )));
            }
            
            member.length = Some(length);
        }

        // Calculate plate dimensions
        for plate in self.plates.values_mut() {
            let i_node = self.nodes.get(&plate.i_node).unwrap();
            let j_node = self.nodes.get(&plate.j_node).unwrap();
            let m_node = self.nodes.get(&plate.m_node).unwrap();
            
            plate.width = Some(i_node.distance_to(j_node));
            plate.height = Some(j_node.distance_to(m_node));
        }

        Ok(())
    }

    /// Build the global stiffness matrix
    fn build_global_stiffness(&self) -> FEAResult<(Mat, HashMap<String, usize>)> {
        let n_nodes = self.nodes.len();
        let n_dofs = n_nodes * 6;
        
        let mut k_global = Mat::zeros(n_dofs, n_dofs);
        
        // Map node names to DOF indices
        let mut dof_map: HashMap<String, usize> = HashMap::new();
        for (name, node) in &self.nodes {
            dof_map.insert(name.clone(), node.id.unwrap() * 6);
        }

        // Add member stiffness
        for member in self.members.values() {
            let i_node = self.nodes.get(&member.i_node).unwrap();
            let j_node = self.nodes.get(&member.j_node).unwrap();
            let material = self.materials.get(&member.material).unwrap();
            let section = self.sections.get(&member.section).unwrap();
            
            let length = member.length.unwrap();
            
            // Get local stiffness matrix
            let k_local = math::member_local_stiffness(
                material.e,
                material.g,
                section.a,
                section.iy,
                section.iz,
                section.j,
                length,
            );
            
            // Apply end releases
            let k_local = math::apply_releases(&k_local, &member.releases.as_array());
            
            // Get transformation matrix
            let t = math::member_transformation_matrix(
                &i_node.coords(),
                &j_node.coords(),
                member.rotation,
            );
            
            // Transform to global: K_global = T^T * K_local * T
            let k_member_global = t.transpose() * k_local * t;
            
            // Assemble into global matrix
            let i_dof = dof_map[&member.i_node];
            let j_dof = dof_map[&member.j_node];
            
            // i-i block
            for a in 0..6 {
                for b in 0..6 {
                    k_global[(i_dof + a, i_dof + b)] += k_member_global[(a, b)];
                }
            }
            
            // i-j block
            for a in 0..6 {
                for b in 0..6 {
                    k_global[(i_dof + a, j_dof + b)] += k_member_global[(a, b + 6)];
                }
            }
            
            // j-i block
            for a in 0..6 {
                for b in 0..6 {
                    k_global[(j_dof + a, i_dof + b)] += k_member_global[(a + 6, b)];
                }
            }
            
            // j-j block
            for a in 0..6 {
                for b in 0..6 {
                    k_global[(j_dof + a, j_dof + b)] += k_member_global[(a + 6, b + 6)];
                }
            }
        }

        Ok((k_global, dof_map))
    }

    /// Build the global load vector for a load combination
    fn build_load_vector(
        &self,
        combo: &LoadCombination,
        dof_map: &HashMap<String, usize>,
    ) -> FEAResult<FEVec> {
        let n_dofs = self.nodes.len() * 6;
        let mut p = FEVec::zeros(n_dofs);

        // Add node loads
        for (node_name, loads) in &self.node_loads {
            let dof = dof_map[node_name];
            
            for load in loads {
                let factor = combo.factor(&load.case);
                if factor.abs() > 1e-10 {
                    let load_arr = load.as_array();
                    for i in 0..6 {
                        p[dof + i] += factor * load_arr[i];
                    }
                }
            }
        }

        // Add fixed end reactions from member loads (simplified - uniform loads only for now)
        for (member_name, loads) in &self.member_dist_loads {
            let member = self.members.get(member_name).unwrap();
            let length = member.length.unwrap();
            
            let i_node = self.nodes.get(&member.i_node).unwrap();
            let j_node = self.nodes.get(&member.j_node).unwrap();
            
            let t = math::member_transformation_matrix(
                &i_node.coords(),
                &j_node.coords(),
                member.rotation,
            );
            
            for load in loads {
                let factor = combo.factor(&load.case);
                if factor.abs() < 1e-10 {
                    continue;
                }
                
                // Get FER in local coordinates
                let direction = match load.direction {
                    crate::loads::LoadDirection::Fx => 0,
                    crate::loads::LoadDirection::Fy => 1,
                    crate::loads::LoadDirection::Fz => 2,
                    _ => continue, // Skip global direction loads for now
                };
                
                let w = factor * load.w1; // Assume uniform for now
                let fer_local = math::fer_uniform_load(w, length, direction);
                
                // Transform to global
                let fer_global = t.transpose() * fer_local;
                
                // Subtract from load vector (FER is reaction, so negate)
                let i_dof = dof_map[&member.i_node];
                let j_dof = dof_map[&member.j_node];
                
                for i in 0..6 {
                    p[i_dof + i] -= fer_global[i];
                    p[j_dof + i] -= fer_global[i + 6];
                }
            }
        }

        Ok(p)
    }

    /// Solve linear system with support conditions
    fn solve_linear(
        &mut self,
        k_global: &Mat,
        p_global: &FEVec,
        dof_map: &HashMap<String, usize>,
        combo_name: &str,
    ) -> FEAResult<()> {
        let n_dofs = self.nodes.len() * 6;
        
        // Identify free and restrained DOFs
        let mut free_dofs: Vec<usize> = Vec::new();
        let mut restrained_dofs: Vec<usize> = Vec::new();
        let mut enforced_displacements: HashMap<usize, f64> = HashMap::new();
        
        for node_name in self.nodes.keys() {
            let base_dof = dof_map[node_name];
            
            if let Some(support) = self.supports.get(node_name) {
                let restraints = [
                    support.dx,
                    support.dy,
                    support.dz,
                    support.rx,
                    support.ry,
                    support.rz,
                ];
                let enforced = support.enforced_displacements();
                
                for i in 0..6 {
                    if restraints[i] {
                        restrained_dofs.push(base_dof + i);
                        if let Some(val) = enforced[i] {
                            enforced_displacements.insert(base_dof + i, val);
                        }
                    } else {
                        free_dofs.push(base_dof + i);
                    }
                }
            } else {
                for i in 0..6 {
                    free_dofs.push(base_dof + i);
                }
            }
        }

        if free_dofs.is_empty() {
            return Err(FEAError::AnalysisFailed(
                "No free degrees of freedom".to_string(),
            ));
        }

        // Partition stiffness matrix and load vector
        let n_free = free_dofs.len();
        let mut k11 = Mat::zeros(n_free, n_free);
        let mut p1 = FEVec::zeros(n_free);
        
        for (i, &di) in free_dofs.iter().enumerate() {
            p1[i] = p_global[di];
            
            for (j, &dj) in free_dofs.iter().enumerate() {
                k11[(i, j)] = k_global[(di, dj)];
            }
            
            // Account for enforced displacements
            for (&dj, &val) in &enforced_displacements {
                p1[i] -= k_global[(di, dj)] * val;
            }
        }

        // Solve K11 * D1 = P1
        let d1 = match math::solve_linear_system(&k11, &p1) {
            Some(d) => d,
            None => return Err(FEAError::SingularMatrix),
        };

        // Assemble full displacement vector
        let mut d_full = FEVec::zeros(n_dofs);
        
        for (i, &di) in free_dofs.iter().enumerate() {
            d_full[di] = d1[i];
        }
        
        for (&di, &val) in &enforced_displacements {
            d_full[di] = val;
        }

        // Store nodal displacements
        for (node_name, node) in self.nodes.iter_mut() {
            let base_dof = dof_map[node_name];
            let disp = [
                d_full[base_dof],
                d_full[base_dof + 1],
                d_full[base_dof + 2],
                d_full[base_dof + 3],
                d_full[base_dof + 4],
                d_full[base_dof + 5],
            ];
            node.displacements.insert(combo_name.to_string(), disp);
        }

        Ok(())
    }

    /// Solve using P-Delta iteration
    fn solve_p_delta(
        &mut self,
        k_global: &Mat,
        p_global: &FEVec,
        dof_map: &HashMap<String, usize>,
        combo_name: &str,
        options: &AnalysisOptions,
    ) -> FEAResult<()> {
        // First iteration: linear solution
        self.solve_linear(k_global, p_global, dof_map, combo_name)?;
        
        // Iterative P-Delta
        for _iter in 0..options.max_iterations {
            // Calculate member axial forces
            self.calculate_member_forces(combo_name)?;
            
            // Build geometric stiffness matrix
            let kg = self.build_geometric_stiffness(dof_map)?;
            
            // Combined stiffness
            let k_combined = k_global + &kg;
            
            // Solve again
            let old_displacements: Vec<f64> = self.nodes.values()
                .filter_map(|n| n.displacements.get(combo_name))
                .flat_map(|d| d.iter().copied())
                .collect();
            
            self.solve_linear(&k_combined, p_global, dof_map, combo_name)?;
            
            // Check convergence
            let new_displacements: Vec<f64> = self.nodes.values()
                .filter_map(|n| n.displacements.get(combo_name))
                .flat_map(|d| d.iter().copied())
                .collect();
            
            let mut max_diff = 0.0_f64;
            for (old, new) in old_displacements.iter().zip(new_displacements.iter()) {
                max_diff = max_diff.max((new - old).abs());
            }
            
            if max_diff < options.tolerance {
                return Ok(());
            }
        }
        
        Err(FEAError::ConvergenceFailed(options.max_iterations))
    }

    /// Build geometric stiffness matrix for P-Delta
    fn build_geometric_stiffness(&self, dof_map: &HashMap<String, usize>) -> FEAResult<Mat> {
        let n_dofs = self.nodes.len() * 6;
        let mut kg_global = Mat::zeros(n_dofs, n_dofs);

        for member in self.members.values() {
            // Get axial force from latest analysis
            let p = member.local_forces.values()
                .next()
                .map(|f| -f[0])
                .unwrap_or(0.0);
            
            if p.abs() < 1e-10 {
                continue;
            }
            
            let section = self.sections.get(&member.section).unwrap();
            let length = member.length.unwrap();
            
            let i_node = self.nodes.get(&member.i_node).unwrap();
            let j_node = self.nodes.get(&member.j_node).unwrap();
            
            // Local geometric stiffness
            let kg_local = math::member_geometric_stiffness(
                p,
                section.a,
                section.iy,
                section.iz,
                length,
            );
            
            // Transform to global
            let t = math::member_transformation_matrix(
                &i_node.coords(),
                &j_node.coords(),
                member.rotation,
            );
            
            let kg_member_global = t.transpose() * kg_local * t;
            
            // Assemble
            let i_dof = dof_map[&member.i_node];
            let j_dof = dof_map[&member.j_node];
            
            for a in 0..6 {
                for b in 0..6 {
                    kg_global[(i_dof + a, i_dof + b)] += kg_member_global[(a, b)];
                    kg_global[(i_dof + a, j_dof + b)] += kg_member_global[(a, b + 6)];
                    kg_global[(j_dof + a, i_dof + b)] += kg_member_global[(a + 6, b)];
                    kg_global[(j_dof + a, j_dof + b)] += kg_member_global[(a + 6, b + 6)];
                }
            }
        }

        Ok(kg_global)
    }

    /// Calculate member forces from displacements
    /// 
    /// The total member forces are:
    ///   F_total = K_local * d_local + FER
    /// 
    /// where FER (fixed end reactions) accounts for distributed loads along the member.
    /// This is the same approach as PyNite and standard structural analysis.
    fn calculate_member_forces(&mut self, combo_name: &str) -> FEAResult<()> {
        // Get load combination for factor lookup
        let combo = self.load_combos.get(combo_name).cloned()
            .ok_or_else(|| FEAError::AnalysisFailed(format!("Load combo not found: {}", combo_name)))?;
        
        // Collect member names and their distributed loads first to avoid borrow issues
        let member_names: Vec<String> = self.members.keys().cloned().collect();
        
        for member_name in member_names {
            let member = self.members.get(&member_name).unwrap();
            let i_node = self.nodes.get(&member.i_node).unwrap();
            let j_node = self.nodes.get(&member.j_node).unwrap();
            let material = self.materials.get(&member.material).unwrap();
            let section = self.sections.get(&member.section).unwrap();
            let length = member.length.unwrap();
            let rotation = member.rotation;
            let i_node_name = member.i_node.clone();
            let j_node_name = member.j_node.clone();
            
            // Get nodal displacements
            let d_i = i_node.displacements.get(combo_name)
                .ok_or_else(|| FEAError::NotAnalyzed)?;
            let d_j = j_node.displacements.get(combo_name)
                .ok_or_else(|| FEAError::NotAnalyzed)?;
            
            // Global displacement vector for member
            let d_global = math::Vec12::from_iterator(
                d_i.iter().chain(d_j.iter()).copied()
            );
            
            // Transformation matrix
            let t = math::member_transformation_matrix(
                &i_node.coords(),
                &j_node.coords(),
                rotation,
            );
            
            // Local displacements
            let d_local = t * d_global;
            
            // Local stiffness
            let k_local = math::member_local_stiffness(
                material.e,
                material.g,
                section.a,
                section.iy,
                section.iz,
                section.j,
                length,
            );
            
            // Local forces from nodal displacements: F_elastic = K_local * d_local
            let mut f_local = k_local * d_local;
            
            // Add fixed end reactions (FER) from distributed loads
            // This is critical: FER accounts for loads applied between nodes
            // Following PyNite's convention: F = K*d + FER
            // FER represents the member end forces due to loads between nodes
            if let Some(loads) = self.member_dist_loads.get(&member_name) {
                for load in loads {
                    let factor = combo.factor(&load.case);
                    if factor.abs() < 1e-10 {
                        continue;
                    }
                    
                    // Get direction in local coordinates
                    let direction = match load.direction {
                        crate::loads::LoadDirection::Fx => 0,
                        crate::loads::LoadDirection::Fy => 1,
                        crate::loads::LoadDirection::Fz => 2,
                        _ => continue, // Skip global direction loads for now
                    };
                    
                    let w = factor * load.w1; // Assume uniform load
                    let fer = math::fer_uniform_load(w, length, direction);
                    
                    // Add FER to elastic forces: F_member = K*d + FER
                    for i in 0..12 {
                        f_local[i] += fer[i];
                    }
                }
            }
            
            // Store results
            let mut forces = [0.0; 12];
            for i in 0..12 {
                forces[i] = f_local[i];
            }
            
            let mut displacements = [0.0; 12];
            for i in 0..12 {
                displacements[i] = d_local[i];
            }
            
            // Update the member
            let member = self.members.get_mut(&member_name).unwrap();
            member.local_forces.insert(combo_name.to_string(), forces);
            member.local_displacements.insert(combo_name.to_string(), displacements);
        }

        Ok(())
    }

    /// Calculate reactions at supports
    fn calculate_reactions(
        &mut self,
        combo_name: &str,
        _dof_map: &HashMap<String, usize>,
    ) -> FEAResult<()> {
        // First, collect all the reaction contributions
        let mut all_reactions: HashMap<String, [f64; 6]> = HashMap::new();
        
        for (node_name, support) in &self.supports {
            if !support.is_supported() {
                continue;
            }
            all_reactions.insert(node_name.clone(), [0.0; 6]);
        }
        
        // Sum forces from connected members
        for member in self.members.values() {
            let forces = member.local_forces.get(combo_name)
                .ok_or_else(|| FEAError::NotAnalyzed)?;
            
            let i_node = self.nodes.get(&member.i_node).unwrap();
            let j_node = self.nodes.get(&member.j_node).unwrap();
            
            let t = math::member_transformation_matrix(
                &i_node.coords(),
                &j_node.coords(),
                member.rotation,
            );
            
            let f_local = math::Vec12::from_iterator(forces.iter().copied());
            let f_global = t.transpose() * f_local;
            
            if let Some(reactions) = all_reactions.get_mut(&member.i_node) {
                for i in 0..6 {
                    reactions[i] += f_global[i];
                }
            }
            if let Some(reactions) = all_reactions.get_mut(&member.j_node) {
                for i in 0..6 {
                    reactions[i] += f_global[i + 6];
                }
            }
        }
        
        // Subtract applied loads and store results
        for (node_name, reactions) in &mut all_reactions {
            if let Some(loads) = self.node_loads.get(node_name) {
                let combo = self.load_combos.get(combo_name).unwrap();
                for load in loads {
                    let factor = combo.factor(&load.case);
                    let load_arr = load.as_array();
                    for i in 0..6 {
                        reactions[i] -= factor * load_arr[i];
                    }
                }
            }
        }
        
        // Store reactions in nodes - only for restrained DOFs
        for (node_name, mut reactions) in all_reactions {
            // Mask out reactions for DOFs that are not restrained
            if let Some(support) = self.supports.get(&node_name) {
                let mask = [support.dx, support.dy, support.dz, support.rx, support.ry, support.rz];
                for i in 0..6 {
                    if !mask[i] {
                        reactions[i] = 0.0;
                    }
                }
            }
            
            if let Some(node) = self.nodes.get_mut(&node_name) {
                node.reactions.insert(combo_name.to_string(), reactions);
            }
        }

        Ok(())
    }

    // ========================
    // Result Access Methods
    // ========================

    /// Get node displacement
    pub fn node_displacement(&self, node_name: &str, combo_name: &str) -> FEAResult<NodeDisplacement> {
        let node = self.nodes.get(node_name)
            .ok_or_else(|| FEAError::NodeNotFound(node_name.to_string()))?;
        
        let disp = node.displacements.get(combo_name)
            .ok_or_else(|| FEAError::NotAnalyzed)?;
        
        Ok(NodeDisplacement::from_array(*disp))
    }

    /// Get node reactions
    pub fn node_reactions(&self, node_name: &str, combo_name: &str) -> FEAResult<Reactions> {
        let node = self.nodes.get(node_name)
            .ok_or_else(|| FEAError::NodeNotFound(node_name.to_string()))?;
        
        let rxn = node.reactions.get(combo_name)
            .ok_or_else(|| FEAError::NotAnalyzed)?;
        
        Ok(Reactions::from_array(*rxn))
    }

    /// Get member forces at i-node
    pub fn member_forces_i(&self, member_name: &str, combo_name: &str) -> FEAResult<MemberForces> {
        let member = self.members.get(member_name)
            .ok_or_else(|| FEAError::MemberNotFound(member_name.to_string()))?;
        
        let forces = member.local_forces.get(combo_name)
            .ok_or_else(|| FEAError::NotAnalyzed)?;
        
        Ok(MemberForces::from_i_node_forces(forces))
    }

    /// Get member forces at j-node
    pub fn member_forces_j(&self, member_name: &str, combo_name: &str) -> FEAResult<MemberForces> {
        let member = self.members.get(member_name)
            .ok_or_else(|| FEAError::MemberNotFound(member_name.to_string()))?;
        
        let forces = member.local_forces.get(combo_name)
            .ok_or_else(|| FEAError::NotAnalyzed)?;
        
        Ok(MemberForces::from_j_node_forces(forces))
    }

    /// Get analysis summary
    pub fn summary(&self, combo_name: &str) -> FEAResult<AnalysisSummary> {
        if self.solution.is_none() {
            return Err(FEAError::NotAnalyzed);
        }
        
        let mut summary = AnalysisSummary {
            num_nodes: self.nodes.len(),
            num_members: self.members.len(),
            num_plates: self.plates.len() + self.quads.len(),
            total_dofs: self.nodes.len() * 6,
            ..Default::default()
        };
        
        // Find max displacement
        for (name, node) in &self.nodes {
            if let Some(disp) = node.displacements.get(combo_name) {
                let mag = (disp[0].powi(2) + disp[1].powi(2) + disp[2].powi(2)).sqrt();
                if mag > summary.max_displacement {
                    summary.max_displacement = mag;
                    summary.max_disp_node = name.clone();
                }
            }
        }
        
        // Find max reaction
        for (name, node) in &self.nodes {
            if let Some(rxn) = node.reactions.get(combo_name) {
                let mag = (rxn[0].powi(2) + rxn[1].powi(2) + rxn[2].powi(2)).sqrt();
                if mag > summary.max_reaction {
                    summary.max_reaction = mag;
                    summary.max_reaction_node = name.clone();
                }
            }
        }
        
        // Find max member forces
        for (name, member) in &self.members {
            if let Some(forces) = member.local_forces.get(combo_name) {
                let axial = forces[0].abs();
                if axial > summary.max_axial {
                    summary.max_axial = axial;
                    summary.max_axial_member = name.clone();
                }
                
                let moment = forces[4].abs().max(forces[5].abs())
                    .max(forces[10].abs()).max(forces[11].abs());
                if moment > summary.max_moment {
                    summary.max_moment = moment;
                    summary.max_moment_member = name.clone();
                }
            }
        }
        
        // Count free DOFs
        let mut restrained = 0;
        for support in self.supports.values() {
            restrained += support.num_restrained();
        }
        summary.free_dofs = summary.total_dofs - restrained;
        
        Ok(summary)
    }

    /// Check if model has been analyzed
    pub fn is_analyzed(&self) -> bool {
        self.solution.is_some()
    }

    /// Get the analysis type used
    pub fn solution_type(&self) -> Option<AnalysisType> {
        self.solution
    }

    /// Get all load combination names
    pub fn combo_names(&self) -> Vec<String> {
        self.load_combos.keys().cloned().collect()
    }

    /// Get all load case names
    pub fn load_cases(&self) -> Vec<String> {
        let mut cases: Vec<String> = Vec::new();
        
        for loads in self.node_loads.values() {
            for load in loads {
                if !cases.contains(&load.case) {
                    cases.push(load.case.clone());
                }
            }
        }
        
        for loads in self.member_dist_loads.values() {
            for load in loads {
                if !cases.contains(&load.case) {
                    cases.push(load.case.clone());
                }
            }
        }
        
        cases.sort();
        cases
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_simple_cantilever() {
        let mut model = FEModel::new();
        
        // Add material
        model.add_material("Steel", Material::steel()).unwrap();
        
        // Add section (arbitrary rectangular)
        model.add_section("Section1", Section::rectangular(0.3, 0.5)).unwrap();
        
        // Add nodes (10m cantilever)
        model.add_node("N1", Node::new(0.0, 0.0, 0.0)).unwrap();
        model.add_node("N2", Node::new(10.0, 0.0, 0.0)).unwrap();
        
        // Add member
        model.add_member("M1", Member::new("N1", "N2", "Steel", "Section1")).unwrap();
        
        // Add support (fixed at N1)
        model.add_support("N1", Support::fixed()).unwrap();
        
        // Add load (10 kN downward at N2)
        model.add_node_load("N2", NodeLoad::fy(-10000.0, "Case 1")).unwrap();
        
        // Analyze
        model.analyze_linear().unwrap();
        
        // Check results
        let disp = model.node_displacement("N2", "Combo 1").unwrap();
        
        // Tip deflection should be negative (downward)
        assert!(disp.dy < 0.0, "Expected negative Y displacement");
        
        // Check reactions
        let rxn = model.node_reactions("N1", "Combo 1").unwrap();
        assert_relative_eq!(rxn.fy, 10000.0, epsilon = 1.0); // Should equal applied load
    }
}
