use dioxus::prelude::*;
use crate::components::layout::{BeamProperties, ShellProperties, MaterialProperties};

#[component]
pub fn ContentArea() -> Element {
    let show_extrude_panel = use_signal(|| false);
    let show_constraints_panel = use_signal(|| false);
    let show_point_load_panel = use_signal(|| false);
    let show_distributed_load_panel = use_signal(|| false);
    let show_pressure_load_panel = use_signal(|| false);
    let show_analysis_panel = use_signal(|| false);
    let show_mesh_panel = use_signal(|| false);
    
    // New property panels
    let show_beam_properties = use_signal(|| false);
    let show_shell_properties = use_signal(|| false);
    let show_material_properties = use_signal(|| false);
    
    // Shared property states
    let beam_properties = use_signal(BeamProperties::default);
    let shell_properties = use_signal(ShellProperties::default);
    let material_properties = use_signal(MaterialProperties::default);
    
    rsx! {
        main { class: "content-area",
            header { class: "content-header",
                h2 { "Frameworks v1.0" }
            }
            div { class: "content-body",
                div { class: "viewport-container",
                    div { class: "viewport-toolbar",
                        crate::components::layout::ViewportToolbar {
                            show_extrude_panel: show_extrude_panel,
                            show_constraints_panel: show_constraints_panel,
                            show_point_load_panel: show_point_load_panel,
                            show_distributed_load_panel: show_distributed_load_panel,
                            show_pressure_load_panel: show_pressure_load_panel,
                            show_analysis_panel: show_analysis_panel,
                            show_mesh_panel: show_mesh_panel,
                            show_beam_properties: show_beam_properties,
                            show_shell_properties: show_shell_properties,
                            show_material_properties: show_material_properties,
                        }
                    }
                    div { class: "canvas-wrapper",
                        crate::components::visualization::ThreeJsCanvas  {}
                    }
                    div { class: "canvas-wrapper",
                        crate::components::layout::Console {}
                    }
                    crate::components::layout::RightPanel {
                        show_extrude: show_extrude_panel
                    }
                    crate::components::layout::ConstraintsPanel {
                        show_constraints: show_constraints_panel
                    }
                    crate::components::layout::PointLoadPanel {
                        show_panel: show_point_load_panel
                    }
                    crate::components::layout::DistributedLoadPanel {
                        show_panel: show_distributed_load_panel
                    }
                    crate::components::layout::pressure_load_panel::PressureLoadPanel {
                        show_panel: show_pressure_load_panel
                    }
                    crate::components::layout::AnalysisPanel {
                        show: show_analysis_panel,
                        beam_props: beam_properties,
                        shell_props: shell_properties,
                        material_props: material_properties,
                    }
                    crate::components::layout::MeshPanel {
                        show_panel: show_mesh_panel
                    }
                    // New Property Panels
                    crate::components::layout::BeamPropertiesPanel {
                        show: show_beam_properties,
                        properties: beam_properties,
                    }
                    crate::components::layout::ShellPropertiesPanel {
                        show: show_shell_properties,
                        properties: shell_properties,
                    }
                    crate::components::layout::MaterialPropertiesPanel {
                        show: show_material_properties,
                        properties: material_properties,
                    }
                }
            }
        }
    }
}
