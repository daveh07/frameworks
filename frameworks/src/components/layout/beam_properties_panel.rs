use dioxus::prelude::*;

/// Member end releases configuration
#[derive(Clone, PartialEq, Debug, Default)]
pub struct MemberReleases {
    /// i-node releases [DX, DY, DZ, RX, RY, RZ]
    pub i_node_ry: bool,  // Moment release about local y-axis at i-node
    pub i_node_rz: bool,  // Moment release about local z-axis at i-node
    pub j_node_ry: bool,  // Moment release about local y-axis at j-node
    pub j_node_rz: bool,  // Moment release about local z-axis at j-node
}

impl MemberReleases {
    pub fn is_pinned_i(&self) -> bool {
        self.i_node_ry && self.i_node_rz
    }
    
    pub fn is_pinned_j(&self) -> bool {
        self.j_node_ry && self.j_node_rz
    }
    
    pub fn pin_i(&mut self) {
        self.i_node_ry = true;
        self.i_node_rz = true;
    }
    
    pub fn pin_j(&mut self) {
        self.j_node_ry = true;
        self.j_node_rz = true;
    }
    
    pub fn fix_i(&mut self) {
        self.i_node_ry = false;
        self.i_node_rz = false;
    }
    
    pub fn fix_j(&mut self) {
        self.j_node_ry = false;
        self.j_node_rz = false;
    }
}

#[derive(Clone, PartialEq)]
pub struct BeamProperties {
    pub section_type: String,
    pub width: f64,
    pub height: f64,
    pub flange_thickness: f64,
    pub web_thickness: f64,
    pub releases: MemberReleases,
}

impl Default for BeamProperties {
    fn default() -> Self {
        Self {
            section_type: "Rectangular".to_string(),
            // Default to a standard 200mm (deep) x 100mm (wide) rectangular section.
            width: 0.1,
            height: 0.2,
            flange_thickness: 0.015,
            web_thickness: 0.010,
            releases: MemberReleases::default(),
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
    
    // Member releases state
    let mut i_node_ry = use_signal(|| properties().releases.i_node_ry);
    let mut i_node_rz = use_signal(|| properties().releases.i_node_rz);
    let mut j_node_ry = use_signal(|| properties().releases.j_node_ry);
    let mut j_node_rz = use_signal(|| properties().releases.j_node_rz);
    
    // Track if releases have been modified
    let mut releases_modified = use_signal(|| false);

    // Update parent properties when section dimensions change (not releases)
    use_effect(move || {
        properties.set(BeamProperties {
            section_type: section_type(),
            width: width(),
            height: height(),
            flange_thickness: flange_thickness(),
            web_thickness: web_thickness(),
            releases: MemberReleases {
                i_node_ry: i_node_ry(),
                i_node_rz: i_node_rz(),
                j_node_ry: j_node_ry(),
                j_node_rz: j_node_rz(),
            },
        });
    });
    
    // Function to apply releases to selected beams
    let apply_releases = move |_| {
        let releases = MemberReleases {
            i_node_ry: i_node_ry(),
            i_node_rz: i_node_rz(),
            j_node_ry: j_node_ry(),
            j_node_rz: j_node_rz(),
        };
        
        // Sync releases to selected beams in Three.js
        #[cfg(target_arch = "wasm32")]
        {
            use wasm_bindgen::prelude::*;
            use web_sys::window;
            
            if let Some(win) = window() {
                // Check if the function exists before calling
                let func = js_sys::Reflect::get(&win, &JsValue::from_str("setSelectedBeamReleases"));
                if let Ok(f) = func {
                    if f.is_function() {
                        let js_releases = serde_wasm_bindgen::to_value(&serde_json::json!({
                            "i_node_ry": releases.i_node_ry,
                            "i_node_rz": releases.i_node_rz,
                            "j_node_ry": releases.j_node_ry,
                            "j_node_rz": releases.j_node_rz,
                        })).unwrap_or(JsValue::NULL);
                        
                        let func: js_sys::Function = f.unchecked_into();
                        let _ = func.call1(&JsValue::NULL, &js_releases);
                    }
                }
            }
        }
        
        releases_modified.set(false);
    };

    let is_ibeam = section_type() == "IBeam";
    let is_circular = section_type() == "Circular";
    
    // Check if ends are fully pinned
    let i_pinned = i_node_ry() && i_node_rz();
    let j_pinned = j_node_ry() && j_node_rz();

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
                
                // Member End Releases
                div { class: "section",
                    h4 { "End Releases" }
                    p { class: "section-hint", "Release moment capacity at member ends (creates a pin)" }
                    
                    // I-Node (Start) releases
                    div { class: "release-group",
                        div { class: "release-header",
                            span { class: "release-label", "Start Node (i)" }
                            button {
                                class: if i_pinned { "pin-btn active" } else { "pin-btn" },
                                onclick: move |_| {
                                    if i_pinned {
                                        // Unpin (fix)
                                        i_node_ry.set(false);
                                        i_node_rz.set(false);
                                    } else {
                                        // Pin (release both)
                                        i_node_ry.set(true);
                                        i_node_rz.set(true);
                                    }
                                    releases_modified.set(true);
                                },
                                if i_pinned { "⚪ Pinned" } else { "● Fixed" }
                            }
                        }
                        div { class: "release-checkboxes",
                            label { class: "checkbox-label",
                                input {
                                    r#type: "checkbox",
                                    checked: i_node_ry(),
                                    onchange: move |evt| {
                                        i_node_ry.set(evt.checked());
                                        releases_modified.set(true);
                                    },
                                }
                                "Ry (bending about local y)"
                            }
                            label { class: "checkbox-label",
                                input {
                                    r#type: "checkbox",
                                    checked: i_node_rz(),
                                    onchange: move |evt| {
                                        i_node_rz.set(evt.checked());
                                        releases_modified.set(true);
                                    },
                                }
                                "Rz (bending about local z)"
                            }
                        }
                    }
                    
                    // J-Node (End) releases
                    div { class: "release-group",
                        div { class: "release-header",
                            span { class: "release-label", "End Node (j)" }
                            button {
                                class: if j_pinned { "pin-btn active" } else { "pin-btn" },
                                onclick: move |_| {
                                    if j_pinned {
                                        // Unpin (fix)
                                        j_node_ry.set(false);
                                        j_node_rz.set(false);
                                    } else {
                                        // Pin (release both)
                                        j_node_ry.set(true);
                                        j_node_rz.set(true);
                                    }
                                    releases_modified.set(true);
                                },
                                if j_pinned { "⚪ Pinned" } else { "● Fixed" }
                            }
                        }
                        div { class: "release-checkboxes",
                            label { class: "checkbox-label",
                                input {
                                    r#type: "checkbox",
                                    checked: j_node_ry(),
                                    onchange: move |evt| {
                                        j_node_ry.set(evt.checked());
                                        releases_modified.set(true);
                                    },
                                }
                                "Ry (bending about local y)"
                            }
                            label { class: "checkbox-label",
                                input {
                                    r#type: "checkbox",
                                    checked: j_node_rz(),
                                    onchange: move |evt| {
                                        j_node_rz.set(evt.checked());
                                        releases_modified.set(true);
                                    },
                                }
                                "Rz (bending about local z)"
                            }
                        }
                    }
                    
                    // Apply Releases Button
                    div { class: "release-apply",
                        button {
                            class: if releases_modified() { "apply-btn highlight" } else { "apply-btn" },
                            onclick: apply_releases,
                            "✓ Apply Releases"
                        }
                        if releases_modified() {
                            span { class: "modified-hint", "* Changes pending" }
                        }
                    }
                }
            }
        }
    }
}
