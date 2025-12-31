use dioxus::prelude::*;

#[derive(Clone, PartialEq)]
pub struct BeamProperties {
    pub section_type: String,
    pub width: f64,
    pub height: f64,
    pub flange_thickness: f64,
    pub web_thickness: f64,
}

impl Default for BeamProperties {
    fn default() -> Self {
        Self {
            section_type: "Rectangular".to_string(),
            width: 0.3,
            height: 0.5,
            flange_thickness: 0.015,
            web_thickness: 0.010,
        }
    }
}

#[component]
pub fn BeamPropertiesPanel(
    show: Signal<bool>,
    properties: Signal<BeamProperties>,
) -> Element {
    let mut section_type = use_signal(|| properties().section_type.clone());
    let mut width = use_signal(|| properties().width);
    let mut height = use_signal(|| properties().height);
    let mut flange_thickness = use_signal(|| properties().flange_thickness);
    let mut web_thickness = use_signal(|| properties().web_thickness);

    // Update parent properties when values change
    use_effect(move || {
        properties.set(BeamProperties {
            section_type: section_type(),
            width: width(),
            height: height(),
            flange_thickness: flange_thickness(),
            web_thickness: web_thickness(),
        });
    });

    let is_ibeam = section_type() == "IBeam";
    let is_circular = section_type() == "Circular";

    rsx! {
        div {
            class: "right-panel beam-properties-panel",
            style: if show() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "🔩 Beam Properties" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            div { class: "panel-content",
                // Section Type Selection
                div { class: "section",
                    h4 { "Section Type" }
                    div { class: "property-group",
                        div { class: "section-type-buttons",
                            button {
                                class: if section_type() == "Rectangular" { "section-btn active" } else { "section-btn" },
                                onclick: move |_| section_type.set("Rectangular".to_string()),
                                title: "Rectangular Section",
                                div { class: "section-icon rect-icon" }
                                span { "Rectangular" }
                            }
                            button {
                                class: if section_type() == "Circular" { "section-btn active" } else { "section-btn" },
                                onclick: move |_| section_type.set("Circular".to_string()),
                                title: "Circular Section",
                                div { class: "section-icon circ-icon" }
                                span { "Circular" }
                            }
                            button {
                                class: if section_type() == "IBeam" { "section-btn active" } else { "section-btn" },
                                onclick: move |_| section_type.set("IBeam".to_string()),
                                title: "I-Beam / Box Section",
                                div { class: "section-icon ibeam-icon" }
                                span { "I-Beam" }
                            }
                        }
                    }
                }
                
                // Dimensions
                div { class: "section",
                    h4 { "Dimensions" }
                    
                    if is_circular {
                        // Circular: diameter only
                        div { class: "property-group",
                            label { "Diameter (m)" }
                            input {
                                r#type: "number",
                                value: "{width}",
                                oninput: move |evt| {
                                    if let Ok(val) = evt.value().parse::<f64>() {
                                        width.set(val);
                                        height.set(val); // Keep height synced for circular
                                    }
                                },
                                step: "0.01",
                                min: "0.01"
                            }
                        }
                    } else {
                        // Rectangular or I-Beam: width and height
                        div { class: "property-group",
                            label { if is_ibeam { "Flange Width (m)" } else { "Width (m)" } }
                            input {
                                r#type: "number",
                                value: "{width}",
                                oninput: move |evt| {
                                    if let Ok(val) = evt.value().parse::<f64>() {
                                        width.set(val);
                                    }
                                },
                                step: "0.01",
                                min: "0.01"
                            }
                        }
                        div { class: "property-group",
                            label { if is_ibeam { "Total Depth (m)" } else { "Height (m)" } }
                            input {
                                r#type: "number",
                                value: "{height}",
                                oninput: move |evt| {
                                    if let Ok(val) = evt.value().parse::<f64>() {
                                        height.set(val);
                                    }
                                },
                                step: "0.01",
                                min: "0.01"
                            }
                        }
                    }
                    
                    // I-Beam specific: flange and web thickness
                    if is_ibeam {
                        div { class: "property-group",
                            label { "Flange Thickness (m)" }
                            input {
                                r#type: "number",
                                value: "{flange_thickness}",
                                oninput: move |evt| {
                                    if let Ok(val) = evt.value().parse::<f64>() {
                                        flange_thickness.set(val);
                                    }
                                },
                                step: "0.001",
                                min: "0.001"
                            }
                        }
                        div { class: "property-group",
                            label { "Web Thickness (m)" }
                            input {
                                r#type: "number",
                                value: "{web_thickness}",
                                oninput: move |evt| {
                                    if let Ok(val) = evt.value().parse::<f64>() {
                                        web_thickness.set(val);
                                    }
                                },
                                step: "0.001",
                                min: "0.001"
                            }
                        }
                    }
                }
                
                // Section Preview (visual representation)
                div { class: "section",
                    h4 { "Section Preview" }
                    div { class: "section-preview",
                        if is_circular {
                            svg {
                                width: "100",
                                height: "100",
                                view_box: "0 0 100 100",
                                circle {
                                    cx: "50",
                                    cy: "50",
                                    r: "40",
                                    fill: "none",
                                    stroke: "#3b82f6",
                                    stroke_width: "3"
                                }
                            }
                        } else if is_ibeam {
                            svg {
                                width: "100",
                                height: "100",
                                view_box: "0 0 100 100",
                                // Top flange
                                rect {
                                    x: "15",
                                    y: "10",
                                    width: "70",
                                    height: "12",
                                    fill: "#3b82f6"
                                }
                                // Web
                                rect {
                                    x: "40",
                                    y: "22",
                                    width: "20",
                                    height: "56",
                                    fill: "#3b82f6"
                                }
                                // Bottom flange
                                rect {
                                    x: "15",
                                    y: "78",
                                    width: "70",
                                    height: "12",
                                    fill: "#3b82f6"
                                }
                            }
                        } else {
                            svg {
                                width: "100",
                                height: "100",
                                view_box: "0 0 100 100",
                                rect {
                                    x: "20",
                                    y: "15",
                                    width: "60",
                                    height: "70",
                                    fill: "none",
                                    stroke: "#3b82f6",
                                    stroke_width: "3"
                                }
                            }
                        }
                    }
                }
                
                // Calculated Properties Display
                div { class: "section",
                    h4 { "Section Properties" }
                    div { class: "calculated-props",
                        {
                            let (area, iy, iz) = if is_circular {
                                let r = width() / 2.0;
                                let a = std::f64::consts::PI * r * r;
                                let i = std::f64::consts::PI * r.powi(4) / 4.0;
                                (a, i, i)
                            } else if is_ibeam {
                                let b = width();
                                let h = height();
                                let tf = flange_thickness();
                                let tw = web_thickness();
                                let a = 2.0 * b * tf + (h - 2.0 * tf) * tw;
                                let iy = b * h.powi(3) / 12.0 - (b - tw) * (h - 2.0 * tf).powi(3) / 12.0;
                                let iz = 2.0 * tf * b.powi(3) / 12.0 + (h - 2.0 * tf) * tw.powi(3) / 12.0;
                                (a, iy, iz)
                            } else {
                                let b = width();
                                let h = height();
                                let a = b * h;
                                let iy = b * h.powi(3) / 12.0;
                                let iz = h * b.powi(3) / 12.0;
                                (a, iy, iz)
                            };
                            
                            rsx! {
                                div { class: "prop-row",
                                    span { class: "prop-label", "Area:" }
                                    span { class: "prop-value", "{area:.6} m²" }
                                }
                                div { class: "prop-row",
                                    span { class: "prop-label", "Iy:" }
                                    span { class: "prop-value", "{iy:.8} m⁴" }
                                }
                                div { class: "prop-row",
                                    span { class: "prop-label", "Iz:" }
                                    span { class: "prop-value", "{iz:.8} m⁴" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
