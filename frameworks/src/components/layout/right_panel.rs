use dioxus::prelude::*;
use dioxus::document::eval;
use crate::components::visualization::three_bindings::extrude_beams;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
struct NodeProperties {
    id: String,
    x: f64,
    y: f64,
    z: f64,
}

#[component]
pub fn RightPanel(show_extrude: Signal<bool>) -> Element {
    let mut extrude_direction = use_signal(|| "z".to_string());
    let mut extrude_length = use_signal(|| "1".to_string());
    let mut extrude_iterations = use_signal(|| "1".to_string());
    
    let mut selected_node = use_signal(|| None::<NodeProperties>);

    use_effect(move || {
        let mut eval = eval(r#"
            window.addEventListener('node-selected', (e) => {
                dioxus.send({ type: 'node-selected', data: e.detail });
            });
            window.addEventListener('node-deselected', (e) => {
                dioxus.send({ type: 'node-deselected', data: e.detail });
            });
        "#);

        spawn(async move {
            while let Ok(msg) = eval.recv().await {
                if let Ok(val) = serde_json::from_value::<serde_json::Value>(msg) {
                    if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
                        match msg_type {
                            "node-selected" => {
                                if let Some(data) = val.get("data") {
                                    if let Ok(props) = serde_json::from_value::<NodeProperties>(data.clone()) {
                                        selected_node.set(Some(props));
                                    }
                                }
                            }
                            "node-deselected" => {
                                selected_node.set(None);
                            }
                            _ => {}
                        }
                    }
                }
            }
        });
    });

    let show_panel = show_extrude() || selected_node().is_some();

    rsx! {
        div {
            class: "right-panel",
            style: if show_panel {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            // Header
            div {
                class: "right-panel-header",
                h3 { 
                    if selected_node().is_some() { "Node Properties" } else { "Extrude Options" }
                }
                button {
                    class: "close-btn",
                    onclick: move |_| {
                        show_extrude.set(false);
                        selected_node.set(None);
                    },
                    "×"
                }
            }
            
            // Content
            div {
                class: "right-panel-content",
                
                if let Some(node) = selected_node() {
                    div {
                        class: "node-properties",
                        div {
                            class: "form-group",
                            label { class: "form-label", "Node ID" }
                            div { class: "form-input", "{node.id}" }
                        }
                        div {
                            class: "form-group",
                            label { class: "form-label", "Coordinates" }
                            div { 
                                style: "display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;",
                                div {
                                    label { class: "form-label", "X" }
                                    input { class: "form-input", value: "{node.x:.3}", readonly: true }
                                }
                                div {
                                    label { class: "form-label", "Y" }
                                    input { class: "form-input", value: "{node.y:.3}", readonly: true }
                                }
                                div {
                                    label { class: "form-label", "Z" }
                                    input { class: "form-input", value: "{node.z:.3}", readonly: true }
                                }
                            }
                        }
                        
                        div {
                            class: "form-group",
                            style: "margin-top: 20px;",
                            button {
                                class: "btn-primary",
                                onclick: move |_| {
                                    // TODO: Open constraints panel or add support
                                    println!("Add support clicked for node {}", node.id);
                                },
                                "Add Support"
                            }
                        }
                    }
                } else {
                    // Extrude Options
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
            }
            
            // Footer with buttons (only for Extrude)
            if selected_node().is_none() {
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
                        "Extrude"
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
                    }
                }
            }
        }
    }
}
