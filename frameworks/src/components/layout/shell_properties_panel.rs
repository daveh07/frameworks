use dioxus::prelude::*;

#[derive(Clone, PartialEq)]
pub struct ShellProperties {
    pub thickness: f64,
    pub is_quadratic: bool,
}

impl Default for ShellProperties {
    fn default() -> Self {
        Self {
            thickness: 0.2,
            is_quadratic: false,
        }
    }
}

#[component]
pub fn ShellPropertiesPanel(
    show: Signal<bool>,
    properties: Signal<ShellProperties>,
) -> Element {
    let mut thickness = use_signal(|| properties().thickness);
    let mut is_quadratic = use_signal(|| properties().is_quadratic);

    // Update parent properties when values change
    use_effect(move || {
        properties.set(ShellProperties {
            thickness: thickness(),
            is_quadratic: is_quadratic(),
        });
    });

    rsx! {
        div {
            class: "right-panel shell-properties-panel",
            style: if show() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "🔲 Shell/Plate Properties" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            div { class: "panel-content",
                div { class: "section",
                    h4 { "Plate Thickness" }
                    div { class: "property-group",
                        label { "Thickness (m)" }
                        input {
                            r#type: "number",
                            value: "{thickness}",
                            oninput: move |evt| {
                                if let Ok(val) = evt.value().parse::<f64>() {
                                    thickness.set(val);
                                }
                            },
                            step: "0.01",
                            min: "0.01"
                        }
                    }
                    
                    // Quick presets
                    div { class: "thickness-presets mt-2",
                        label { "Quick Presets:" }
                        div { class: "preset-buttons",
                            button {
                                class: "preset-btn",
                                onclick: move |_| thickness.set(0.100),
                                "100mm"
                            }
                            button {
                                class: "preset-btn",
                                onclick: move |_| thickness.set(0.150),
                                "150mm"
                            }
                            button {
                                class: "preset-btn",
                                onclick: move |_| thickness.set(0.200),
                                "200mm"
                            }
                            button {
                                class: "preset-btn",
                                onclick: move |_| thickness.set(0.250),
                                "250mm"
                            }
                            button {
                                class: "preset-btn",
                                onclick: move |_| thickness.set(0.300),
                                "300mm"
                            }
                        }
                    }
                }
                
                div { class: "section",
                    h4 { "Element Type" }
                    div { class: "property-group",
                        div { class: "element-type-options",
                            label { class: "radio-option",
                                input {
                                    r#type: "radio",
                                    name: "element_type",
                                    checked: !is_quadratic(),
                                    onchange: move |_| is_quadratic.set(false),
                                }
                                span { "S4 (4-node linear)" }
                            }
                            label { class: "radio-option",
                                input {
                                    r#type: "radio",
                                    name: "element_type",
                                    checked: is_quadratic(),
                                    onchange: move |_| is_quadratic.set(true),
                                }
                                span { "S8R (8-node quadratic)" }
                            }
                        }
                    }
                    p { class: "help-text",
                        if is_quadratic() {
                            "Quadratic elements provide better accuracy but require finer mesh."
                        } else {
                            "Linear elements are faster to compute and suitable for most cases."
                        }
                    }
                }
                
                // Visual representation
                div { class: "section",
                    h4 { "Plate Visualization" }
                    div { class: "plate-preview",
                        svg {
                            width: "120",
                            height: "80",
                            view_box: "0 0 120 80",
                            // Plate cross-section
                            rect {
                                x: "10",
                                y: "30",
                                width: "100",
                                height: "20",
                                fill: "#3b82f6",
                                opacity: "0.7"
                            }
                            // Thickness annotation
                            line {
                                x1: "115",
                                y1: "30",
                                x2: "115",
                                y2: "50",
                                stroke: "#ef4444",
                                stroke_width: "2"
                            }
                            // Arrow heads
                            path {
                                d: "M 112 33 L 115 30 L 118 33",
                                stroke: "#ef4444",
                                stroke_width: "1.5",
                                fill: "none"
                            }
                            path {
                                d: "M 112 47 L 115 50 L 118 47",
                                stroke: "#ef4444",
                                stroke_width: "1.5",
                                fill: "none"
                            }
                        }
                        div { class: "thickness-label",
                            "t = {thickness:.3} m ({thickness * 1000.0:.0} mm)"
                        }
                    }
                }
            }
        }
    }
}
