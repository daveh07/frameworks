use dioxus::prelude::*;
use dioxus::document::eval;
use crate::components::visualization::three_bindings::{
    toggle_add_node_mode, toggle_select_node_mode, toggle_draw_beam_mode, toggle_draw_plate_mode,
    select_all_nodes, clear_node_selection, delete_selected, set_plan_view, reset_view,
};
use crate::hooks::use_design_state::{DesignState, ViewMode};
use crate::components::layout::{LoadCasesModal, LoadCase};

// Clean SVG icons as inline strings
const ICON_NODE: &str = r#"<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>"#;
const ICON_BEAM: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="4" y1="12" x2="20" y2="12"/></svg>"#;
const ICON_PLATE: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>"#;
const ICON_EXTRUDE: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M12 4v12M8 12l4 4 4-4M6 20h12"/></svg>"#;
const ICON_COPY: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="8" y="8" width="10" height="10" rx="1"/><path d="M16 8V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2"/></svg>"#;
const ICON_MATERIAL: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="8"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/></svg>"#;
const ICON_PROPERTIES: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="9" y1="9" x2="21" y2="9"/><line x1="9" y1="15" x2="21" y2="15"/></svg>"#;
const ICON_POINT_LOAD: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><line x1="12" y1="4" x2="12" y2="16"/><path d="M8 12l4 4 4-4"/><circle cx="12" cy="20" r="1.5" fill="currentColor"/></svg>"#;
const ICON_DIST_LOAD: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><line x1="6" y1="6" x2="6" y2="14"/><line x1="10" y1="6" x2="10" y2="14"/><line x1="14" y1="6" x2="14" y2="14"/><line x1="18" y1="6" x2="18" y2="14"/><path d="M4 10l2 4M8 10l2 4M12 10l2 4M16 10l2 4"/><line x1="4" y1="18" x2="20" y2="18"/></svg>"#;
const ICON_PRESSURE: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="4" y="14" width="16" height="6" rx="1"/><line x1="7" y1="4" x2="7" y2="14"/><line x1="12" y1="4" x2="12" y2="14"/><line x1="17" y1="4" x2="17" y2="14"/><path d="M5 8l2 4M10 8l2 4M15 8l2 4"/></svg>"#;
const ICON_VISIBLE: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>"#;
const ICON_RUN: &str = r#"<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>"#;
const ICON_CONSTRAINT: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M12 4v8"/><path d="M6 12l12 0"/><path d="M4 16l16 0"/><path d="M6 20l2-4M12 20v-4M18 20l-2-4"/></svg>"#;
const ICON_MESH: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/></svg>"#;
const ICON_SELECT: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M4 4l7 18 2-7 7-2L4 4z"/></svg>"#;
const ICON_SELECT_ALL: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>"#;
const ICON_CLEAR: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>"#;
const ICON_DELETE: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>"#;
const ICON_VIEW_3D: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>"#;
const ICON_ORBIT: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="8" ry="3"/></svg>"#;
const ICON_PLAN: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>"#;
const ICON_EXAMPLE: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="4" y="14" width="16" height="6" rx="1"/><rect x="6" y="8" width="12" height="6" rx="1"/><rect x="8" y="2" width="8" height="6" rx="1"/></svg>"#;
const ICON_LOAD_CASES: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>"#;
const ICON_SPLIT_BEAM: &str = r#"<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><line x1="4" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="20" y2="12"/><circle cx="12" cy="12" r="2" fill="currentColor"/><line x1="12" y1="6" x2="12" y2="9" stroke-dasharray="2 1"/><line x1="12" y1="15" x2="12" y2="18" stroke-dasharray="2 1"/></svg>"#;

#[component]
pub fn ViewportToolbar(
    show_extrude_panel: Signal<bool>,
    show_constraints_panel: Signal<bool>,
    show_point_load_panel: Signal<bool>,
    show_distributed_load_panel: Signal<bool>,
    show_pressure_load_panel: Signal<bool>,
    show_analysis_panel: Signal<bool>,
    show_mesh_panel: Signal<bool>,
    show_beam_properties: Signal<bool>,
    show_shell_properties: Signal<bool>,
    show_material_properties: Signal<bool>,
    show_split_beam_panel: Signal<bool>,
) -> Element {
    let mut grid_visible = use_signal(|| true);
    let mut axes_visible = use_signal(|| true);
    let mut active_tool = use_signal(|| "none".to_string());
    let mut selection_filter = use_signal(|| "all".to_string());
    
    // Load cases state
    let mut show_load_cases_modal = use_signal(|| false);
    let mut load_cases = use_signal(|| vec![LoadCase::default()]);
    let mut active_load_case = use_signal(|| 1usize);
    
    // Get design state to track view mode
    let design_state = use_context::<DesignState>();
    let mut ds_for_toggle = design_state.clone();
    let mut ds_for_shortcuts = design_state.clone();
    let view_mode = design_state.view_mode.read();

    // Keyboard shortcuts
    let mut init_shortcuts = use_signal(|| false);
    
    use_effect(move || {
        if *init_shortcuts.read() { return; }
        init_shortcuts.set(true);

        let mut shortcut_eval = eval(r#"
            window.addEventListener('keydown', (e) => {
                // Ignore if typing in an input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                let key = e.key.toUpperCase();
                let shift = e.shiftKey;
                
                // Send relevant keys to Rust
                if (['A', 'X', 'E', 'V', 'S', 'P', 'N', 'B', 'DELETE', 'BACKSPACE'].includes(key)) {
                    dioxus.send({ key, shift });
                }
            });
        "#);

        let mut ds_for_shortcuts = ds_for_shortcuts.clone();

        spawn(async move {
            while let Ok(msg) = shortcut_eval.recv().await {
                if let Ok(val) = serde_json::from_value::<serde_json::Value>(msg) {
                    let key = val["key"].as_str().unwrap_or("");
                    let shift = val["shift"].as_bool().unwrap_or(false);
                    
                    match key {
                        "A" => select_all_nodes(),
                        "X" => clear_node_selection(),
                        "E" => show_extrude_panel.set(!show_extrude_panel()),
                        "DELETE" | "BACKSPACE" => {
                            if shift {
                                delete_selected();
                            }
                        },
                        "V" => {
                            active_tool.set("view".to_string());
                            let _ = eval("
                                if (window.modes && window.modes.selectNode) window.toggleSelectNodeMode();
                                if (window.modes && window.modes.addNode) window.toggleAddNodeMode();
                                if (window.modes && window.modes.drawBeam) window.toggleDrawBeamMode();
                            ");
                        },
                        "S" => {
                            active_tool.set("select".to_string());
                            toggle_select_node_mode();
                        },
                        "N" => {
                            if shift {
                                selection_filter.set("nodes".to_string());
                                let _ = eval("if (window.setSelectionFilter) window.setSelectionFilter('nodes');");
                            }
                        },
                        "B" => {
                            if shift {
                                selection_filter.set("beams".to_string());
                                let _ = eval("if (window.setSelectionFilter) window.setSelectionFilter('beams');");
                            }
                        },
                        "P" => {
                            if shift {
                                selection_filter.set("plates".to_string());
                                let _ = eval("if (window.setSelectionFilter) window.setSelectionFilter('plates');");
                            } else {
                                // Toggle 2D/3D
                                let current = *ds_for_shortcuts.view_mode.read();
                                match current {
                                    ViewMode::ThreeD => {
                                        if let Some(elevation) = ds_for_shortcuts.get_active_storey_elevation() {
                                            ds_for_shortcuts.set_view_mode(ViewMode::TwoD);
                                            set_plan_view(elevation);
                                        } else {
                                            ds_for_shortcuts.set_view_mode(ViewMode::TwoD);
                                            set_plan_view(0.0);
                                        }
                                    },
                                    ViewMode::TwoD => {
                                        ds_for_shortcuts.set_view_mode(ViewMode::ThreeD);
                                        reset_view();
                                    }
                                }
                            }
                        },
                        _ => {}
                    }
                }
            }
        });
    });

    rsx! {
        // Toolbar
        div { class: "viewport-toolbar",
            div { class: "toolbar-row",
                div { class: "toolbar-container-single",
                    // DRAW TOOLS
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "Draw" }
                        div { class: "toolbar-section-buttons",
                            button {
                                class: "tool-button-icon",
                                title: "Load Example 3-Story Building",
                                onclick: move |_| {
                                    eval("if (window.loadExampleStructure) { const result = window.loadExampleStructure(); console.log('Example structure loaded:', result); }");
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_EXAMPLE }
                            }
                            button {
                                class: if active_tool() == "add_node" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Add Node (N)",
                                onclick: move |_| {
                                    if active_tool() == "add_node" {
                                        active_tool.set("none".to_string());
                                    } else {
                                        active_tool.set("add_node".to_string());
                                    }
                                    toggle_add_node_mode();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_NODE }
                            }
                            button {
                                class: if active_tool() == "draw_beam" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Add Beam (B)",
                                onclick: move |_| {
                                    if active_tool() == "draw_beam" {
                                        active_tool.set("none".to_string());
                                    } else {
                                        active_tool.set("draw_beam".to_string());
                                    }
                                    toggle_draw_beam_mode();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_BEAM }
                            }
                            button {
                                class: if active_tool() == "draw_plate" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Add Plate (P)",
                                onclick: move |_| {
                                    if active_tool() == "draw_plate" {
                                        active_tool.set("none".to_string());
                                    } else {
                                        active_tool.set("draw_plate".to_string());
                                    }
                                    toggle_draw_plate_mode();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_PLATE }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Extrude",
                                onclick: move |_| {
                                    let opening = !show_extrude_panel();
                                    // Close other panels when opening this one
                                    if opening {
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_extrude_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_EXTRUDE }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Copy Elements",
                                onclick: move |_| {
                                    eval("if (window.startCopyElements) window.startCopyElements();");
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_COPY }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Split Beam",
                                onclick: move |_| {
                                    let opening = !show_split_beam_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_split_beam_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_SPLIT_BEAM }
                            }
                        }
                    }
                    
                    div { class: "toolbar-divider" }
                    
                    // PROPERTIES
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "Properties" }
                        div { class: "toolbar-section-buttons",
                            button {
                                class: "tool-button-icon",
                                title: "Beam Properties",
                                onclick: move |_| {
                                    let opening = !show_beam_properties();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_beam_properties.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_BEAM }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Shell/Plate Properties",
                                onclick: move |_| {
                                    let opening = !show_shell_properties();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_shell_properties.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_PLATE }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Material Properties",
                                onclick: move |_| {
                                    let opening = !show_material_properties();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                    }
                                    show_material_properties.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_MATERIAL }
                            }
                        }
                    }
                    
                    div { class: "toolbar-divider" }
                    
                    // LOADING
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "Loads" }
                        div { class: "toolbar-section-buttons",
                            // Load Cases dropdown
                            select {
                                class: "load-case-select",
                                title: "Active Load Case",
                                value: "{active_load_case}",
                                onchange: move |e| {
                                    if let Ok(id) = e.value().parse::<usize>() {
                                        active_load_case.set(id);
                                        let js = format!("window.activeLoadCase = {}; console.log('Active load case:', window.activeLoadCase);", id);
                                        eval(&js);
                                    }
                                },
                                for case in load_cases.read().iter() {
                                    option {
                                        value: "{case.id}",
                                        selected: *active_load_case.read() == case.id,
                                        "Case {case.id}: {case.title}"
                                    }
                                }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Manage Load Cases",
                                onclick: move |_| {
                                    show_load_cases_modal.set(true);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_LOAD_CASES }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Point Load",
                                onclick: move |_| {
                                    let opening = !show_point_load_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_point_load_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_POINT_LOAD }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Distributed Load",
                                onclick: move |_| {
                                    let opening = !show_distributed_load_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_distributed_load_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_DIST_LOAD }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Pressure Load",
                                onclick: move |_| {
                                    let opening = !show_pressure_load_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_pressure_load_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_PRESSURE }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Toggle Load Visibility",
                                onclick: move |_| {
                                    eval(r#"window.toggleLoadsVisibility();"#);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_VISIBLE }
                            }
                        }
                    }
                    
                    div { class: "toolbar-divider" }
                    
                    // ANALYSIS
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "Analysis" }
                        div { class: "toolbar-section-buttons",
                            button {
                                class: "tool-button-icon run-btn",
                                title: "Run Structural Analysis",
                                onclick: move |_| {
                                    let opening = !show_analysis_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_analysis_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_RUN }
                            }
                        }
                    }
                    
                    div { class: "toolbar-divider" }
                    
                    // CONSTRAINTS
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "Constraints" }
                        div { class: "toolbar-section-buttons",
                            button {
                                class: "tool-button-icon",
                                title: "Add Support",
                                onclick: move |_| {
                                    let opening = !show_constraints_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_mesh_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_constraints_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_CONSTRAINT }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Mesh Controls",
                                onclick: move |_| {
                                    let opening = !show_mesh_panel();
                                    if opening {
                                        show_extrude_panel.set(false);
                                        show_constraints_panel.set(false);
                                        show_point_load_panel.set(false);
                                        show_distributed_load_panel.set(false);
                                        show_pressure_load_panel.set(false);
                                        show_analysis_panel.set(false);
                                        show_beam_properties.set(false);
                                        show_shell_properties.set(false);
                                        show_material_properties.set(false);
                                        show_split_beam_panel.set(false);
                                    }
                                    show_mesh_panel.set(opening);
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_MESH }
                            }
                        }
                    }
                    
                    div { style: "flex: 1;" }
                    
                    // SELECTION TOOLS
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "Select" }
                        div { class: "toolbar-section-buttons",
                            button {
                                class: if active_tool() == "select" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Select Mode (S)",
                                onclick: move |_| {
                                    if active_tool() == "select" {
                                        active_tool.set("none".to_string());
                                    } else {
                                        active_tool.set("select".to_string());
                                    }
                                    toggle_select_node_mode();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_SELECT }
                            }
                            button {
                                class: if selection_filter() == "nodes" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Filter: Nodes",
                                onclick: move |_| {
                                    if selection_filter() == "nodes" {
                                        selection_filter.set("all".to_string());
                                        eval("if (window.setSelectionFilter) window.setSelectionFilter('all');");
                                    } else {
                                        selection_filter.set("nodes".to_string());
                                        eval("if (window.setSelectionFilter) window.setSelectionFilter('nodes');");
                                    }
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_NODE }
                            }
                            button {
                                class: if selection_filter() == "beams" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Filter: Beams",
                                onclick: move |_| {
                                    if selection_filter() == "beams" {
                                        selection_filter.set("all".to_string());
                                        eval("if (window.setSelectionFilter) window.setSelectionFilter('all');");
                                    } else {
                                        selection_filter.set("beams".to_string());
                                        eval("if (window.setSelectionFilter) window.setSelectionFilter('beams');");
                                    }
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_BEAM }
                            }
                            button {
                                class: if selection_filter() == "plates" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Filter: Plates",
                                onclick: move |_| {
                                    if selection_filter() == "plates" {
                                        selection_filter.set("all".to_string());
                                        eval("if (window.setSelectionFilter) window.setSelectionFilter('all');");
                                    } else {
                                        selection_filter.set("plates".to_string());
                                        eval("if (window.setSelectionFilter) window.setSelectionFilter('plates');");
                                    }
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_PLATE }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Select All (Ctrl+A)",
                                onclick: move |_| {
                                    select_all_nodes();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_SELECT_ALL }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Clear Selection (Esc)",
                                onclick: move |_| {
                                    clear_node_selection();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_CLEAR }
                            }
                            button {
                                class: "tool-button-icon delete-btn",
                                title: "Delete Selected (Del)",
                                onclick: move |_| {
                                    delete_selected();
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_DELETE }
                            }
                        }
                    }
                    
                    div { class: "toolbar-divider" }
                    
                    // VIEW TOOLS
                    div { class: "toolbar-section",
                        span { class: "toolbar-section-label", "View" }
                        div { class: "toolbar-section-buttons",
                            // 2D/3D Toggle Button
                            button {
                                class: if *view_mode == ViewMode::TwoD { "tool-button-icon active" } else { "tool-button-icon" },
                                title: if *view_mode == ViewMode::TwoD { "Switch to 3D View" } else { "Switch to 2D View" },
                                onclick: move |_| {
                                    let current = *ds_for_toggle.view_mode.read();
                                    
                                    match current {
                                        ViewMode::ThreeD => {
                                            // Switch to 2D - need active storey
                                            if let Some(elevation) = ds_for_toggle.get_active_storey_elevation() {
                                                ds_for_toggle.set_view_mode(ViewMode::TwoD);
                                                set_plan_view(elevation);
                                            } else {
                                                // No active storey - create one at Y=0 or prompt user
                                                ds_for_toggle.set_view_mode(ViewMode::TwoD);
                                                set_plan_view(0.0);
                                            }
                                        },
                                        ViewMode::TwoD => {
                                            // Switch to 3D
                                            ds_for_toggle.set_view_mode(ViewMode::ThreeD);
                                            reset_view();
                                        }
                                    }
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_VIEW_3D }
                            }
                            button {
                                class: if active_tool() == "view" { "tool-button-icon active" } else { "tool-button-icon" },
                                title: "Orbit/Pan (V)",
                                onclick: move |_| {
                                    active_tool.set("view".to_string());
                                    eval("
                                        if (window.modes && window.modes.selectNode) window.toggleSelectNodeMode();
                                        if (window.modes && window.modes.addNode) window.toggleAddNodeMode();
                                        if (window.modes && window.modes.drawBeam) window.toggleDrawBeamMode();
                                    ");
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_ORBIT }
                            }
                            button {
                                class: "tool-button-icon",
                                title: "Plan View (XZ)",
                                onclick: move |_| {
                                    eval("window.setViewportView('plan')");
                                },
                                span { class: "btn-icon", dangerous_inner_html: ICON_PLAN }
                            }
                            button {
                                class: "tool-button-text",
                                title: "Elevation XY",
                                onclick: move |_| {
                                    eval("window.setViewportView('xy')");
                                },
                                "XY"
                            }
                            button {
                                class: "tool-button-text",
                                title: "Elevation YZ",
                                onclick: move |_| {
                                    eval("window.setViewportView('yz')");
                                },
                                "YZ"
                            }
                        }
                    }
                    
                    div { class: "toolbar-divider" }
                    
                    // GRID & AXES
                    div { class: "toolbar-section",
                        div { class: "toolbar-section-buttons",
                            label { class: "checkbox-group mb-0",
                                input { 
                                    r#type: "checkbox",
                                    checked: grid_visible(),
                                    onchange: move |evt| {
                                        let checked = evt.value().parse::<bool>().unwrap_or(false);
                                        grid_visible.set(checked);
                                        eval(&format!("window.toggleViewportGrid({})", checked));
                                    }
                                }
                                span { style: "font-size: 10px;", "Grid" }
                            }
                            label { class: "checkbox-group mb-0",
                                input { 
                                    r#type: "checkbox",
                                    checked: axes_visible(),
                                    onchange: move |evt| {
                                        let checked = evt.value().parse::<bool>().unwrap_or(false);
                                        axes_visible.set(checked);
                                        eval(&format!("window.toggleViewportAxes({})", checked));
                                    }
                                }
                                span { style: "font-size: 10px;", "Axes" }
                            }
                        }
                    }
                }
            }
        }
        
        // View options toolbar (labels toggle)
        ViewOptionsToolbar {}
        
        // Load Cases Modal
        LoadCasesModal {
            show: show_load_cases_modal,
            load_cases: load_cases,
            active_case: active_load_case,
        }
    }
}

#[component]
fn ViewOptionsToolbar() -> Element {
    let mut show_node_labels = use_signal(|| false);
    let mut show_beam_labels = use_signal(|| false);
    let mut show_plate_labels = use_signal(|| false);
    let mut show_mesh_element_labels = use_signal(|| false);
    let mut wireframe_mode = use_signal(|| true); // true = wireframe, false = solid
    let mut nodes_visible = use_signal(|| true); // nodes visible by default
    let mut releases_visible = use_signal(|| true); // member releases visible by default
    let mut supports_visible = use_signal(|| true); // supports visible by default
    
    rsx! {
        div { class: "view-options-toolbar",
            button {
                class: if show_node_labels() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Node Labels",
                onclick: move |_| {
                    let new_val = !show_node_labels();
                    show_node_labels.set(new_val);
                    eval(&format!("if (window.toggleNodeLabels) window.toggleNodeLabels({});", new_val));
                },
                "N"
            }
            button {
                class: if nodes_visible() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Nodes Visibility",
                onclick: move |_| {
                    let new_val = !nodes_visible();
                    nodes_visible.set(new_val);
                    eval(&format!("if (window.toggleNodesVisibility) window.toggleNodesVisibility({});", new_val));
                },
                "●"
            }
            button {
                class: if supports_visible() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Supports Visibility",
                onclick: move |_| {
                    let new_val = !supports_visible();
                    supports_visible.set(new_val);
                    eval(&format!("if (window.toggleSupportsVisibility) window.toggleSupportsVisibility({});", new_val));
                },
                "▲"
            }
            button {
                class: if show_beam_labels() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Beam Labels",
                onclick: move |_| {
                    let new_val = !show_beam_labels();
                    show_beam_labels.set(new_val);
                    eval(&format!("if (window.toggleBeamLabels) window.toggleBeamLabels({});", new_val));
                },
                "B"
            }
            button {
                class: if releases_visible() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Member Releases (○ = Pinned, × = Fixed)",
                onclick: move |_| {
                    let new_val = !releases_visible();
                    releases_visible.set(new_val);
                    eval(&format!("if (window.toggleReleasesVisibility) window.toggleReleasesVisibility({});", new_val));
                },
                "R"
            }
            button {
                class: if show_plate_labels() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Plate Labels",
                onclick: move |_| {
                    let new_val = !show_plate_labels();
                    show_plate_labels.set(new_val);
                    eval(&format!("if (window.togglePlateLabels) window.togglePlateLabels({});", new_val));
                },
                "P"
            }
            button {
                class: if show_mesh_element_labels() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Mesh Element Labels (P1E1, P1E2...)",
                onclick: move |_| {
                    let new_val = !show_mesh_element_labels();
                    show_mesh_element_labels.set(new_val);
                    eval(&format!("if (window.toggleMeshElementLabels) window.toggleMeshElementLabels({});", new_val));
                },
                "E"
            }
            button {
                class: if !wireframe_mode() { "view-option-btn active" } else { "view-option-btn" },
                title: "Toggle Wireframe/Solid View (W)",
                onclick: move |_| {
                    let new_mode = !wireframe_mode();
                    wireframe_mode.set(new_mode);
                    // false = solid mode (pass true to setMeshSolidMode)
                    eval(&format!("if (window.setMeshSolidMode) window.setMeshSolidMode({});", !new_mode));
                },
                "W"
            }
        }
    }
}