use dioxus::prelude::*;
use crate::types::{Plate, ModellingTool, Structure, Material, Storey};

#[derive(Clone, Copy, PartialEq)]
pub enum ViewMode {
    ThreeD,
    TwoD,
}

#[derive(Clone)]
pub struct DesignState {
    pub plates: Signal<Vec<Plate>>,
    pub active_tool: Signal<ModellingTool>,
    pub structure: Signal<Option<Structure>>,
    pub storeys: Signal<Vec<Storey>>,
    pub active_storey_index: Signal<Option<usize>>,
    pub view_mode: Signal<ViewMode>,
}

pub fn use_design_state() -> DesignState {
    let plates = use_signal(|| Vec::new());
    let active_tool = use_signal(|| ModellingTool::Select);
    let structure = use_signal(|| None);
    let storeys = use_signal(|| Vec::new());
    let active_storey_index = use_signal(|| None);
    let view_mode = use_signal(|| ViewMode::ThreeD);
    
    DesignState {
        plates,
        active_tool,
        structure,
        storeys,
        active_storey_index,
        view_mode,
    }
}

impl DesignState {
    /// Initialize with a default steel material (Units: metres and kilonewtons)
    pub fn default_steel_material() -> Material {
        Material {
            name: "Structural Steel".to_string(),
            elastic_modulus: 200e6,  // 200 GPa = 200×10⁶ kN/m²
            poisson_ratio: 0.3,
            density: 77.04,  // 7850 kg/m³ × 9.81 m/s² / 1000 = 77.04 kN/m³
        }
    }
    
    /// Add a new storey at the specified elevation
    pub fn add_storey(&mut self, name: String, elevation: f64) {
        let mut storeys = self.storeys.write();
        storeys.push(Storey {
            name,
            elevation,
            visible: true,
        });
        // Sort by elevation
        storeys.sort_by(|a, b| a.elevation.partial_cmp(&b.elevation).unwrap());
    }
    
    /// Remove storey at index
    pub fn remove_storey(&mut self, index: usize) {
        let mut storeys = self.storeys.write();
        if index < storeys.len() {
            storeys.remove(index);
        }
        drop(storeys); // Release the write lock before reading active
        
        // Clear active if it was this one
        let active = *self.active_storey_index.read();
        if active == Some(index) {
            *self.active_storey_index.write() = None;
        }
    }
    
    /// Set the active storey for plan view
    pub fn set_active_storey(&mut self, index: Option<usize>) {
        *self.active_storey_index.write() = index;
    }
    
    /// Toggle visibility of a storey
    pub fn toggle_storey_visibility(&mut self, index: usize) {
        let mut storeys = self.storeys.write();
        if let Some(storey) = storeys.get_mut(index) {
            storey.visible = !storey.visible;
        }
    }
    
    /// Get the active storey elevation (if any)
    pub fn get_active_storey_elevation(&self) -> Option<f64> {
        let active_idx = *self.active_storey_index.read();
        let storeys = self.storeys.read();
        active_idx.and_then(|idx| storeys.get(idx).map(|s| s.elevation))
    }
    
    /// Set view mode (3D or 2D)
    pub fn set_view_mode(&mut self, mode: ViewMode) {
        *self.view_mode.write() = mode;
    }
    
    /// Toggle between 3D and 2D view modes
    pub fn toggle_view_mode(&mut self) {
        let current = *self.view_mode.read();
        let new_mode = match current {
            ViewMode::ThreeD => ViewMode::TwoD,
            ViewMode::TwoD => ViewMode::ThreeD,
        };
        *self.view_mode.write() = new_mode;
    }
}