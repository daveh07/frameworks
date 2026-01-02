use dioxus::prelude::*;

#[component]
pub fn Console() -> Element {
    rsx! {
        div { class: "console-panel",
            div { class: "console-header",
                span { class: "console-title", "Console Output" }
                div { class: "console-tabs",
                    span { class: "console-tab", "Messages" }
                    span { class: "console-tab console-tab-active", "Solver Log" }
                    span { class: "console-tab", "Warnings" }
                }
            }
            div { class: "console-content",
                div { class: "console-line",
                    span { class: "console-tag console-tag-info", "[INFO]" }
                    span { class: "console-text", "Mesh generated successfully: 2,456 elements, 1,289 nodes" }
                }
                div { class: "console-line",
                    span { class: "console-tag console-tag-info", "[INFO]" }
                    span { class: "console-text", "Analysis type: Plane Stress" }
                }
                div { class: "console-line",
                    span { class: "console-tag console-tag-ready", "[READY]" }
                    span { class: "console-text", "System ready for analysis" }
                }
            }
        }
    }
}