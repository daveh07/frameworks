use dioxus::prelude::*;
use dioxus::document::eval;

#[component]
pub fn MeshPanel(show_panel: Signal<bool>) -> Element {
    let mut mesh_type = use_signal(|| "triangular".to_string());
    let mut mesh_size = use_signal(|| "0.5".to_string());

    rsx! {
        div {
            class: "right-panel",
            style: if show_panel() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            // Header
            div {
                class: "right-panel-header",
                h3 { "Mesh Generation" }
                button {
                    class: "close-btn",
                    onclick: move |_| {
                        show_panel.set(false);
                    },
                    "×"
                }
            }
            
            // Content
            div {
                class: "right-panel-content",
                
                // Mesh Type
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Mesh Type"
                    }
                    select {
                        class: "form-select",
                        value: "{mesh_type}",
                        onchange: move |e| {
                            mesh_type.set(e.value());
                        },
                        option { value: "triangular", "Triangular (Netgen)" }
                        option { value: "quad", "Quad (Netgen)" }
                    }
                }
                
                // Mesh Size
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Element Size"
                    }
                    input {
                        class: "form-input",
                        r#type: "number",
                        value: "{mesh_size}",
                        oninput: move |e| mesh_size.set(e.value()),
                        step: "0.1",
                        min: "0.01"
                    }
                }

                div {
                    class: "info-text",
                    style: "font-size: 0.8em; color: #888; margin-top: 10px;",
                    "Generates finite element mesh using Netgen algorithms."
                }
            }
            
            // Footer with buttons
            div {
                class: "right-panel-footer",
                button {
                    class: "btn-primary",
                    onclick: move |_| {
                        let m_type = mesh_type();
                        let m_size = mesh_size();
                        // Call JS function to handle meshing
                        eval(&format!("if(window.generateMesh) {{ window.generateMesh('{}', {}); }} else {{ console.error('generateMesh not available'); }}", m_type, m_size));
                    },
                    "Generate Mesh"
                }
                div {
                    class: "btn-group",
                    button {
                        class: "btn-secondary",
                        onclick: move |_| {
                            show_panel.set(false);
                        },
                        "Close"
                    }
                }
            }
        }
    }
}
