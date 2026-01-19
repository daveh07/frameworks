use dioxus::prelude::*;

/// Full 6-DOF member end releases configuration
#[derive(Clone, PartialEq, Debug, Default)]
pub struct MemberReleases {
    // i-node (start) releases [Fx, Fy, Fz, Mx, My, Mz]
    pub i_fx: bool,  // Axial release at i-node
    pub i_fy: bool,  // Shear Y release at i-node  
    pub i_fz: bool,  // Shear Z release at i-node
    pub i_mx: bool,  // Torsion release at i-node
    pub i_my: bool,  // Moment Y release at i-node (bending about local y)
    pub i_mz: bool,  // Moment Z release at i-node (bending about local z)
    // j-node (end) releases [Fx, Fy, Fz, Mx, My, Mz]
    pub j_fx: bool,
    pub j_fy: bool,
    pub j_fz: bool,
    pub j_mx: bool,
    pub j_my: bool,
    pub j_mz: bool,
}

impl MemberReleases {
    /// Create from legacy Ry/Rz format
    pub fn from_legacy(i_node_ry: bool, i_node_rz: bool, j_node_ry: bool, j_node_rz: bool) -> Self {
        Self {
            i_fx: false, i_fy: false, i_fz: false, i_mx: false,
            i_my: i_node_ry,
            i_mz: i_node_rz,
            j_fx: false, j_fy: false, j_fz: false, j_mx: false,
            j_my: j_node_ry,
            j_mz: j_node_rz,
        }
    }
    
    /// Get fixity code string for i-node (e.g., "FFFFFF" or "FFFFRR")
    pub fn i_code(&self) -> String {
        format!("{}{}{}{}{}{}",
            if self.i_fx { "R" } else { "F" },
            if self.i_fy { "R" } else { "F" },
            if self.i_fz { "R" } else { "F" },
            if self.i_mx { "R" } else { "F" },
            if self.i_my { "R" } else { "F" },
            if self.i_mz { "R" } else { "F" },
        )
    }
    
    /// Get fixity code string for j-node
    pub fn j_code(&self) -> String {
        format!("{}{}{}{}{}{}",
            if self.j_fx { "R" } else { "F" },
            if self.j_fy { "R" } else { "F" },
            if self.j_fz { "R" } else { "F" },
            if self.j_mx { "R" } else { "F" },
            if self.j_my { "R" } else { "F" },
            if self.j_mz { "R" } else { "F" },
        )
    }
    
    pub fn is_pinned_i(&self) -> bool {
        self.i_my && self.i_mz
    }
    
    pub fn is_pinned_j(&self) -> bool {
        self.j_my && self.j_mz
    }
}

/// Selected beam info from JavaScript
#[derive(Clone, PartialEq, Debug, Default)]
pub struct SelectedBeamInfo {
    pub id: String,
    pub name: String,
    pub length: f64,
    pub start_node_id: String,
    pub end_node_id: String,
}

#[derive(Clone, PartialEq)]
pub struct BeamProperties {
    pub section_type: String,
    pub width: f64,
    pub height: f64,
    pub flange_thickness: f64,
    pub web_thickness: f64,
    pub releases: MemberReleases,
    pub selected_beam: Option<SelectedBeamInfo>,
}

impl Default for BeamProperties {
    fn default() -> Self {
        Self {
            section_type: "Rectangular".to_string(),
            width: 0.1,
            height: 0.2,
            flange_thickness: 0.015,
            web_thickness: 0.010,
            releases: MemberReleases::default(),
            selected_beam: None,
        }
    }
}

#[component]
pub fn BeamPropertiesPanel(
    show: Signal<bool>,
    properties: Signal<BeamProperties>,
) -> Element {
    // Selected beam info
    let mut selected_beam_name = use_signal(|| String::new());
    let mut selected_beam_length = use_signal(|| 0.0f64);
    let mut selected_start_node = use_signal(|| String::new());
    let mut selected_end_node = use_signal(|| String::new());
    let mut has_selection = use_signal(|| false);
    
    // Section properties
    let mut section_type = use_signal(|| properties().section_type.clone());
    let mut width = use_signal(|| properties().width);
    let mut height = use_signal(|| properties().height);
    let mut flange_thickness = use_signal(|| properties().flange_thickness);
    let mut web_thickness = use_signal(|| properties().web_thickness);
    
    // Full 6-DOF releases for i-node (start)
    let mut i_fx = use_signal(|| properties().releases.i_fx);
    let mut i_fy = use_signal(|| properties().releases.i_fy);
    let mut i_fz = use_signal(|| properties().releases.i_fz);
    let mut i_mx = use_signal(|| properties().releases.i_mx);
    let mut i_my = use_signal(|| properties().releases.i_my);
    let mut i_mz = use_signal(|| properties().releases.i_mz);
    
    // Full 6-DOF releases for j-node (end)
    let mut j_fx = use_signal(|| properties().releases.j_fx);
    let mut j_fy = use_signal(|| properties().releases.j_fy);
    let mut j_fz = use_signal(|| properties().releases.j_fz);
    let mut j_mx = use_signal(|| properties().releases.j_mx);
    let mut j_my = use_signal(|| properties().releases.j_my);
    let mut j_mz = use_signal(|| properties().releases.j_mz);
    
    // Track if releases have been modified
    let mut releases_modified = use_signal(|| false);
    
    // Listen for beam selection events from JavaScript
    #[cfg(target_arch = "wasm32")]
    {
        use wasm_bindgen::prelude::*;
        use wasm_bindgen::closure::Closure;
        use web_sys::window;
        
        use_effect(move || {
            let win = match window() {
                Some(w) => w,
                None => return,
            };
            
            // Beam selected event handler
            let mut selected_beam_name_clone = selected_beam_name.clone();
            let mut selected_beam_length_clone = selected_beam_length.clone();
            let mut selected_start_node_clone = selected_start_node.clone();
            let mut selected_end_node_clone = selected_end_node.clone();
            let mut has_selection_clone = has_selection.clone();
            let mut i_my_clone = i_my.clone();
            let mut i_mz_clone = i_mz.clone();
            let mut j_my_clone = j_my.clone();
            let mut j_mz_clone = j_mz.clone();
            let mut releases_modified_clone = releases_modified.clone();
            
            let beam_selected_handler = Closure::wrap(Box::new(move |event: web_sys::CustomEvent| {
                if let Ok(detail) = js_sys::Reflect::get(&event.detail(), &JsValue::from_str("name")) {
                    if let Some(name) = detail.as_string() {
                        selected_beam_name_clone.set(name);
                    }
                }
                if let Ok(detail) = js_sys::Reflect::get(&event.detail(), &JsValue::from_str("length")) {
                    if let Some(len) = detail.as_f64() {
                        selected_beam_length_clone.set(len);
                    }
                }
                if let Ok(detail) = js_sys::Reflect::get(&event.detail(), &JsValue::from_str("startNodeId")) {
                    if let Some(id) = detail.as_string() {
                        selected_start_node_clone.set(id);
                    } else if let Some(id) = detail.as_f64() {
                        selected_start_node_clone.set(format!("{}", id as i32));
                    }
                }
                if let Ok(detail) = js_sys::Reflect::get(&event.detail(), &JsValue::from_str("endNodeId")) {
                    if let Some(id) = detail.as_string() {
                        selected_end_node_clone.set(id);
                    } else if let Some(id) = detail.as_f64() {
                        selected_end_node_clone.set(format!("{}", id as i32));
                    }
                }
                // Load releases from selected beam
                if let Ok(releases) = js_sys::Reflect::get(&event.detail(), &JsValue::from_str("releases")) {
                    if let Ok(i_ry) = js_sys::Reflect::get(&releases, &JsValue::from_str("i_node_ry")) {
                        i_my_clone.set(i_ry.as_bool().unwrap_or(false));
                    }
                    if let Ok(i_rz) = js_sys::Reflect::get(&releases, &JsValue::from_str("i_node_rz")) {
                        i_mz_clone.set(i_rz.as_bool().unwrap_or(false));
                    }
                    if let Ok(j_ry) = js_sys::Reflect::get(&releases, &JsValue::from_str("j_node_ry")) {
                        j_my_clone.set(j_ry.as_bool().unwrap_or(false));
                    }
                    if let Ok(j_rz) = js_sys::Reflect::get(&releases, &JsValue::from_str("j_node_rz")) {
                        j_mz_clone.set(j_rz.as_bool().unwrap_or(false));
                    }
                }
                has_selection_clone.set(true);
                releases_modified_clone.set(false);
            }) as Box<dyn FnMut(_)>);
            
            let _ = win.add_event_listener_with_callback(
                "beam-selected",
                beam_selected_handler.as_ref().unchecked_ref()
            );
            beam_selected_handler.forget();
            
            // Beam deselected event handler
            let mut has_selection_clone2 = has_selection.clone();
            let mut selected_beam_name_clone2 = selected_beam_name.clone();
            
            let beam_deselected_handler = Closure::wrap(Box::new(move |_: web_sys::CustomEvent| {
                has_selection_clone2.set(false);
                selected_beam_name_clone2.set(String::new());
            }) as Box<dyn FnMut(_)>);
            
            let _ = win.add_event_listener_with_callback(
                "beam-deselected",
                beam_deselected_handler.as_ref().unchecked_ref()
            );
            beam_deselected_handler.forget();
        });
    }
    
    // Auto-apply releases whenever any release value changes
    use_effect(move || {
        // Skip initial render or when no beam is selected
        if selected_beam_name().is_empty() {
            return;
        }
        
        #[cfg(target_arch = "wasm32")]
        {
            use wasm_bindgen::prelude::*;
            use web_sys::window;
            
            if let Some(win) = window() {
                let func = js_sys::Reflect::get(&win, &JsValue::from_str("setSelectedBeamReleases"));
                if let Ok(f) = func {
                    if f.is_function() {
                        let js_releases = serde_wasm_bindgen::to_value(&serde_json::json!({
                            "i_node_ry": i_my(),
                            "i_node_rz": i_mz(),
                            "j_node_ry": j_my(),
                            "j_node_rz": j_mz(),
                        })).unwrap_or(JsValue::NULL);
                        
                        let func: js_sys::Function = f.unchecked_into();
                        let _ = func.call1(&JsValue::NULL, &js_releases);
                    }
                }
            }
        }
    });
    
    // Function to apply releases to selected beams (for manual apply button)
    let apply_releases = move |_| {
        #[cfg(target_arch = "wasm32")]
        {
            use wasm_bindgen::prelude::*;
            use web_sys::window;
            
            if let Some(win) = window() {
                let func = js_sys::Reflect::get(&win, &JsValue::from_str("setSelectedBeamReleases"));
                if let Ok(f) = func {
                    if f.is_function() {
                        let js_releases = serde_wasm_bindgen::to_value(&serde_json::json!({
                            "i_node_ry": i_my(),
                            "i_node_rz": i_mz(),
                            "j_node_ry": j_my(),
                            "j_node_rz": j_mz(),
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
    
    // Generate fixity codes
    let i_code = format!("{}{}{}{}{}{}",
        if i_fx() { "R" } else { "F" },
        if i_fy() { "R" } else { "F" },
        if i_fz() { "R" } else { "F" },
        if i_mx() { "R" } else { "F" },
        if i_my() { "R" } else { "F" },
        if i_mz() { "R" } else { "F" },
    );
    let j_code = format!("{}{}{}{}{}{}",
        if j_fx() { "R" } else { "F" },
        if j_fy() { "R" } else { "F" },
        if j_fz() { "R" } else { "F" },
        if j_mx() { "R" } else { "F" },
        if j_my() { "R" } else { "F" },
        if j_mz() { "R" } else { "F" },
    );

    rsx! {
        div {
            class: "right-panel beam-properties-panel",
            style: if show() {
                "transform: translateX(0); pointer-events: auto;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "🔩 Member Properties" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            div { class: "panel-content",
                // Selected Member Info
                div { class: "section member-info-section",
                    h4 { "▼ Member" }
                    if has_selection() {
                        div { class: "member-info-grid",
                            div { class: "info-row",
                                span { class: "info-label", "Member" }
                                span { class: "info-value", "{selected_beam_name}" }
                            }
                            div { class: "info-row",
                                span { class: "info-label", "Length (m)" }
                                span { class: "info-value", "{selected_beam_length:.3}" }
                            }
                            div { class: "info-row",
                                span { class: "info-label", "Node A" }
                                span { class: "info-value", "{selected_start_node}" }
                            }
                            div { class: "info-row",
                                span { class: "info-label", "Node B" }
                                span { class: "info-value", "{selected_end_node}" }
                            }
                        }
                    } else {
                        div { class: "no-selection-hint",
                            "Select a beam to view properties"
                        }
                    }
                }
                
                // Node A / Fixity (i-node)
                div { class: "section fixity-section",
                    div { class: "fixity-header",
                        span { class: "fixity-title", "Node A / Fixity" }
                        span { class: "fixity-node-id", "{selected_start_node}" }
                        span { class: "fixity-code", "{i_code}" }
                    }
                    div { class: "fixity-buttons",
                        // Fx
                        button {
                            class: if i_fx() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Axial (Fx)",
                            onclick: move |_| { i_fx.set(!i_fx()); releases_modified.set(true); },
                            if i_fx() { "R" } else { "F" }
                        }
                        // Fy
                        button {
                            class: if i_fy() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Shear Y (Fy)",
                            onclick: move |_| { i_fy.set(!i_fy()); releases_modified.set(true); },
                            if i_fy() { "R" } else { "F" }
                        }
                        // Fz
                        button {
                            class: if i_fz() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Shear Z (Fz)",
                            onclick: move |_| { i_fz.set(!i_fz()); releases_modified.set(true); },
                            if i_fz() { "R" } else { "F" }
                        }
                        // Mx
                        button {
                            class: if i_mx() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Torsion (Mx)",
                            onclick: move |_| { i_mx.set(!i_mx()); releases_modified.set(true); },
                            if i_mx() { "R" } else { "F" }
                        }
                        // My
                        button {
                            class: if i_my() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Moment Y (My)",
                            onclick: move |_| { i_my.set(!i_my()); releases_modified.set(true); },
                            if i_my() { "R" } else { "F" }
                        }
                        // Mz
                        button {
                            class: if i_mz() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Moment Z (Mz)",
                            onclick: move |_| { i_mz.set(!i_mz()); releases_modified.set(true); },
                            if i_mz() { "R" } else { "F" }
                        }
                    }
                    div { class: "fixity-labels",
                        span { "Fx" }
                        span { "Fy" }
                        span { "Fz" }
                        span { "Mx" }
                        span { "My" }
                        span { "Mz" }
                    }
                }
                
                // Node B / Fixity (j-node)
                div { class: "section fixity-section",
                    div { class: "fixity-header",
                        span { class: "fixity-title", "Node B / Fixity" }
                        span { class: "fixity-node-id", "{selected_end_node}" }
                        span { class: "fixity-code", "{j_code}" }
                    }
                    div { class: "fixity-buttons",
                        // Fx
                        button {
                            class: if j_fx() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Axial (Fx)",
                            onclick: move |_| { j_fx.set(!j_fx()); releases_modified.set(true); },
                            if j_fx() { "R" } else { "F" }
                        }
                        // Fy
                        button {
                            class: if j_fy() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Shear Y (Fy)",
                            onclick: move |_| { j_fy.set(!j_fy()); releases_modified.set(true); },
                            if j_fy() { "R" } else { "F" }
                        }
                        // Fz
                        button {
                            class: if j_fz() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Shear Z (Fz)",
                            onclick: move |_| { j_fz.set(!j_fz()); releases_modified.set(true); },
                            if j_fz() { "R" } else { "F" }
                        }
                        // Mx
                        button {
                            class: if j_mx() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Torsion (Mx)",
                            onclick: move |_| { j_mx.set(!j_mx()); releases_modified.set(true); },
                            if j_mx() { "R" } else { "F" }
                        }
                        // My
                        button {
                            class: if j_my() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Moment Y (My)",
                            onclick: move |_| { j_my.set(!j_my()); releases_modified.set(true); },
                            if j_my() { "R" } else { "F" }
                        }
                        // Mz
                        button {
                            class: if j_mz() { "fixity-btn released" } else { "fixity-btn fixed" },
                            title: "Moment Z (Mz)",
                            onclick: move |_| { j_mz.set(!j_mz()); releases_modified.set(true); },
                            if j_mz() { "R" } else { "F" }
                        }
                    }
                    div { class: "fixity-labels",
                        span { "Fx" }
                        span { "Fy" }
                        span { "Fz" }
                        span { "Mx" }
                        span { "My" }
                        span { "Mz" }
                    }
                }
                
                // Apply button
                if has_selection() {
                    div { class: "release-apply",
                        button {
                            class: if releases_modified() { "apply-btn highlight" } else { "apply-btn" },
                            onclick: apply_releases,
                            "✓ Apply Fixity"
                        }
                        if releases_modified() {
                            span { class: "modified-hint", "* Changes pending" }
                        }
                    }
                }
                
                // Section Type Selection
                div { class: "section",
                    h4 { "▼ Section Type" }
                    div { class: "property-group",
                        div { class: "section-type-buttons",
                            button {
                                class: if section_type() == "Rectangular" { "section-btn active" } else { "section-btn" },
                                onclick: move |_| section_type.set("Rectangular".to_string()),
                                title: "Rectangular Section",
                                div { class: "section-icon rect-icon" }
                                span { "Rect" }
                            }
                            button {
                                class: if section_type() == "Circular" { "section-btn active" } else { "section-btn" },
                                onclick: move |_| section_type.set("Circular".to_string()),
                                title: "Circular Section",
                                div { class: "section-icon circ-icon" }
                                span { "Circ" }
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
                    h4 { "▼ Dimensions" }
                    
                    if is_circular {
                        div { class: "property-group",
                            label { "Diameter (m)" }
                            input {
                                r#type: "number",
                                value: "{width}",
                                oninput: move |evt| {
                                    if let Ok(val) = evt.value().parse::<f64>() {
                                        width.set(val);
                                        height.set(val);
                                    }
                                },
                                step: "0.01",
                                min: "0.01"
                            }
                        }
                    } else {
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
                
                // Section Properties
                div { class: "section",
                    h4 { "▼ Section Properties" }
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
