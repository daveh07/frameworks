use dioxus::prelude::*;
use crate::components::navigation::storeys_section::StoreysSection;

#[component]
pub fn LeftPanel() -> Element {
    rsx! {
        div { class: "main-container",
            // Left Panel
            div { class: "left-panel",
                div { class: "panel-header", "Model Viewer" }
                div { class: "tree-container",
                    // Storeys & Elevations Section
                    StoreysSection {}
                    
                    div { class: "tree-section",
                        div { class: "tree-title", "▼ Elements" }
                        div { class: "tree-item", "□ Nodes" }
                        div { class: "tree-item", "□ Beams" }
                        div { class: "tree-item", "□ Plates" }
                    }
                    
                    div { class: "tree-section",
                        div { class: "tree-title", "▼ Materials" }
                        div { class: "tree-item", "□ Steel AISI 1020" }
                        div { class: "material-indicator" }
                    }
                    
                    div { class: "tree-section",
                        div { class: "tree-title", "▼ Loads & BCs" }
                        div { class: "tree-item", "□ Fixed Support" }
                        div { class: "tree-item", "□ Pressure Load" }
                    }
                    
                    div { class: "tree-section",
                        div { class: "tree-title", "▼ Mesh" }
                        div { class: "tree-item", "□ Mesh-1" }
                        div { class: "tree-subitem", "Elements: 2,456" }
                        div { class: "tree-subitem", "Nodes: 1,289" }
                    }
                    
                    div { class: "tree-section",
                        div { class: "tree-title", "▶ Results" }
                    }
                }
            }
        }
    }
}