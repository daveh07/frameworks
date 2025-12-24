use dioxus::prelude::*;
use dioxus::document::eval;
use crate::components::visualization::three_bindings::extrude_beams;

#[component]
pub fn RightPanel(show_extrude: Signal<bool>) -> Element {
    let mut extrude_direction = use_signal(|| "z".to_string());
    let mut extrude_length = use_signal(|| "1".to_string());
    let mut extrude_iterations = use_signal(|| "1".to_string());

    rsx! {
        div {
            class: "right-panel",
            style: if show_extrude() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            // Header
            div {
                class: "right-panel-header",
                h3 { "Extrude Options" }
                button {
                    class: "close-btn",
                    onclick: move |_| {
                        show_extrude.set(false);
                    },
                    "×"
                }
            }
            
            // Content
            div {
                class: "right-panel-content",
                
                // Direction
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Direction"
                    }
                    select {
                        class: "form-select",
                        value: "{extrude_direction}",
                        onchange: move |e| {
                            extrude_direction.set(e.value());
                        },
                        option { value: "x", "X-Axis" }
                        option { value: "y", "Y-Axis" }
                        option { value: "z", "Z-Axis" }
                    }
                }
                
                // Length
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Length"
                    }
                    input {
                        class: "form-input",
                        r#type: "number",
                        value: "{extrude_length}",
                        oninput: move |e| extrude_length.set(e.value()),
                        step: "0.1",
                        min: "0.01"
                    }
                }
                
                // Iterations
                div {
                    class: "form-group",
                    label {
                        class: "form-label",
                        "Iterations"
                    }
                    input {
                        class: "form-input",
                        r#type: "number",
                        value: "{extrude_iterations}",
                        oninput: move |e| extrude_iterations.set(e.value()),
                        step: "1",
                        min: "1",
                        max: "100"
                    }
                }
            }
            
            // Footer with buttons
            div {
                class: "right-panel-footer",
                button {
                    class: "btn-primary",
                    onclick: move |_| {
                        if let (Ok(length), Ok(iterations)) = (extrude_length().parse::<f64>(), extrude_iterations().parse::<i32>()) {
                            let direction = extrude_direction();
                            for _ in 0..iterations {
                                extrude_beams(&direction, length);
                            }
                        }
                    },
                    "Apply"
                }
                div {
                    class: "btn-group",
                    button {
                        class: "btn-secondary",
                        onclick: move |_| {
                            eval("if(window.undoLastAction) { window.undoLastAction(); } else { console.error('undoLastAction not available'); }");
                        },
                        "Undo"
                    }
                    button {
                        class: "btn-secondary",
                        onclick: move |_| {
                            show_extrude.set(false);
                        },
                        "Close"
                    }
                }
            }
        }
    }
}
