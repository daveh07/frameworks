use dioxus::prelude::*;

#[component]
pub fn ContentArea() -> Element {
    let show_extrude_panel = use_signal(|| false);
    let show_constraints_panel = use_signal(|| false);
    let show_point_load_panel = use_signal(|| false);
    let show_distributed_load_panel = use_signal(|| false);
    let show_pressure_load_panel = use_signal(|| false);
    let show_analysis_panel = use_signal(|| false);
    let show_mesh_panel = use_signal(|| false);
    
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
                            show_mesh_panel: show_mesh_panel
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
                        show: show_analysis_panel
                    }
                    crate::components::layout::MeshPanel {
                        show_panel: show_mesh_panel
                    }
                }
            }
        }
    }
}
