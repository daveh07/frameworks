use dioxus::prelude::*;
use crate::hooks::use_design_state::{DesignState, ViewMode};
use crate::types::Storey;
use crate::components::visualization::three_bindings::{set_plan_view, reset_view};

#[component]
pub fn StoreysSection() -> Element {
    let design_state = use_context::<DesignState>();
    
    let mut new_storey_name = use_signal(|| String::new());
    let mut new_storey_elevation = use_signal(|| String::new());
    let mut show_add_storey = use_signal(|| false);
    
    // Clone data to avoid borrowing issues
    let storeys: Vec<Storey> = design_state.storeys.read().clone();
    let active_idx: Option<usize> = *design_state.active_storey_index.read();
    
    // Clone for add storey callback
    let mut ds_add = design_state.clone();
    
    rsx! {
        div { class: "tree-section",
            div { 
                class: "tree-title", 
                style: "display: flex; justify-content: space-between; align-items: center;",
                span { "▼ Storeys & Elevations" }
                button {
                    class: "px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors",
                    onclick: move |_| {
                        let current = *show_add_storey.read();
                        show_add_storey.set(!current);
                    },
                    "+"
                }
            }
            
            // Add new storey form
            if *show_add_storey.read() {
                div { 
                    class: "tree-item",
                    style: "padding: 8px; background: #f8f9fa;",
                    div { 
                        style: "display: flex; flex-direction: column; gap: 4px;",
                        input {
                            r#type: "text",
                            placeholder: "Storey name",
                            class: "text-xs px-2 py-1 border rounded",
                            value: "{new_storey_name}",
                            oninput: move |evt| new_storey_name.set(evt.value())
                        }
                        input {
                            r#type: "number",
                            step: "0.1",
                            placeholder: "Elevation (m)",
                            class: "text-xs px-2 py-1 border rounded",
                            value: "{new_storey_elevation}",
                            oninput: move |evt| new_storey_elevation.set(evt.value())
                        }
                        div {
                            style: "display: flex; gap: 4px;",
                            button {
                                class: "px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors",
                                onclick: move |_| {
                                    let elev_str = new_storey_elevation.read().clone();
                                    if let Ok(elev) = elev_str.parse::<f64>() {
                                        let name = new_storey_name.read().clone();
                                        let name = if name.is_empty() { 
                                            format!("Storey @ {:.1}m", elev) 
                                        } else { 
                                            name 
                                        };
                                        ds_add.add_storey(name, elev);
                                        new_storey_name.set(String::new());
                                        new_storey_elevation.set(String::new());
                                        show_add_storey.set(false);
                                    }
                                },
                                "Add"
                            }
                            button {
                                class: "px-2 py-1 text-xs font-medium text-white bg-gray-500 rounded hover:bg-gray-600 transition-colors",
                                onclick: move |_| show_add_storey.set(false),
                                "Cancel"
                            }
                        }
                    }
                }
            }
            
            // List existing storeys
            for (idx, storey) in storeys.iter().enumerate() {
                {
                    let is_active = active_idx == Some(idx);
                    let storey_name = storey.name.clone();
                    let storey_elev = storey.elevation;
                    let storey_vis = storey.visible;
                    let mut ds = design_state.clone();
                    let mut ds2 = design_state.clone();
                    let mut ds3 = design_state.clone();
                    
                    rsx! {
                        div { 
                            key: "{idx}",
                            class: "tree-item",
                            style: if is_active {
                                "background: #e3f2fd; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
                            } else {
                                "cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
                            },
                            onclick: move |_| {
                                let current = *ds.active_storey_index.read();
                                if current == Some(idx) {
                                    // Deactivate - reset to 3D view
                                    ds.set_active_storey(None);
                                    ds.set_view_mode(ViewMode::ThreeD);
                                    reset_view();
                                } else {
                                    // Activate - switch to 2D plan view at this elevation
                                    ds.set_active_storey(Some(idx));
                                    ds.set_view_mode(ViewMode::TwoD);
                                    set_plan_view(storey_elev);
                                }
                            },
                            div {
                                style: "display: flex; align-items: center; gap: 4px;",
                                span { 
                                    onclick: move |evt| {
                                        evt.stop_propagation();
                                        ds2.toggle_storey_visibility(idx);
                                    },
                                    if storey_vis { "☑" } else { "☐" }
                                }
                                span { "{storey_name} ({storey_elev:.1}m)" }
                            }
                            button {
                                class: "px-2 py-0.5 text-xs font-bold text-red-600 hover:text-red-800 transition-colors",
                                onclick: move |evt| {
                                    evt.stop_propagation();
                                    ds3.remove_storey(idx);
                                },
                                "×"
                            }
                        }
                    }
                }
            }
            
            // Show origin always
            div { class: "tree-item", style: "color: #888;", "□ Origin (0.0m)" }
        }
    }
}
