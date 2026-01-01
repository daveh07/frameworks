use dioxus::prelude::*;
use dioxus::document::eval;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

static SECTION_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Generate a simple unique ID for sections (WASM-compatible)
fn generate_section_id() -> String {
    // Use js_sys::Date for WASM compatibility instead of std::time::SystemTime
    let timestamp = js_sys::Date::now() as u64;
    let counter = SECTION_COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("sec_{}_{}", timestamp, counter)
}

/// A beam section definition with geometric properties and display color
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BeamSection {
    pub id: String,
    pub name: String,
    pub section_type: SectionType,
    pub width: f64,      // meters
    pub height: f64,     // meters  
    pub flange_thickness: f64,  // for I-beams
    pub web_thickness: f64,     // for I-beams
    pub color: String,   // hex color like "#ff5500"
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SectionType {
    Rectangular,
    Circular,
    IBeam,
}

impl Default for BeamSection {
    fn default() -> Self {
        Self {
            id: generate_section_id(),
            name: "Default Section".to_string(),
            section_type: SectionType::Rectangular,
            width: 0.3,
            height: 0.5,
            flange_thickness: 0.015,
            web_thickness: 0.010,
            color: "#2255aa".to_string(), // Default navy blue
        }
    }
}

impl BeamSection {
    /// Calculate cross-sectional area
    pub fn area(&self) -> f64 {
        match self.section_type {
            SectionType::Circular => {
                let r = self.width / 2.0;
                std::f64::consts::PI * r * r
            }
            SectionType::IBeam => {
                2.0 * self.width * self.flange_thickness + 
                (self.height - 2.0 * self.flange_thickness) * self.web_thickness
            }
            SectionType::Rectangular => {
                self.width * self.height
            }
        }
    }

    /// Calculate moment of inertia Iy (about strong axis)
    pub fn iy(&self) -> f64 {
        match self.section_type {
            SectionType::Circular => {
                let r = self.width / 2.0;
                std::f64::consts::PI * r.powi(4) / 4.0
            }
            SectionType::IBeam => {
                self.width * self.height.powi(3) / 12.0 - 
                (self.width - self.web_thickness) * (self.height - 2.0 * self.flange_thickness).powi(3) / 12.0
            }
            SectionType::Rectangular => {
                self.width * self.height.powi(3) / 12.0
            }
        }
    }

    /// Calculate moment of inertia Iz (about weak axis)
    pub fn iz(&self) -> f64 {
        match self.section_type {
            SectionType::Circular => {
                self.iy() // Same for circular
            }
            SectionType::IBeam => {
                2.0 * self.flange_thickness * self.width.powi(3) / 12.0 + 
                (self.height - 2.0 * self.flange_thickness) * self.web_thickness.powi(3) / 12.0
            }
            SectionType::Rectangular => {
                self.height * self.width.powi(3) / 12.0
            }
        }
    }
}

/// Predefined color palette for sections
const SECTION_COLORS: &[(&str, &str)] = &[
    ("#2255aa", "Navy Blue"),
    ("#ff5500", "Orange"),
    ("#22aa55", "Green"),
    ("#aa2255", "Magenta"),
    ("#5522aa", "Purple"),
    ("#aa5522", "Brown"),
    ("#22aaaa", "Teal"),
    ("#aaaa22", "Olive"),
    ("#ff2222", "Red"),
    ("#2288ff", "Sky Blue"),
];

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SelectedBeamInfo {
    pub id: usize,
    pub section_id: Option<String>,
}

#[component]
pub fn BeamSectionPanel(
    show: Signal<bool>,
) -> Element {
    // List of defined sections
    let mut sections = use_signal(|| vec![BeamSection::default()]);
    
    // Currently selected section for editing
    let mut editing_section_idx = use_signal(|| None::<usize>);
    
    // Currently selected beam(s) from canvas
    let mut selected_beams = use_signal(|| Vec::<SelectedBeamInfo>::new());
    
    // Form state for editing/creating section
    let mut form_name = use_signal(|| "New Section".to_string());
    let mut form_type = use_signal(|| "Rectangular".to_string());
    let mut form_width = use_signal(|| 0.3f64);
    let mut form_height = use_signal(|| 0.5f64);
    let mut form_flange = use_signal(|| 0.015f64);
    let mut form_web = use_signal(|| 0.010f64);
    let mut form_color = use_signal(|| "#2255aa".to_string());
    
    // Show section editor
    let mut show_editor = use_signal(|| false);

    // Listen for beam selection events from canvas
    use_effect(move || {
        let mut eval = eval(r#"
            window.addEventListener('beam-selected', (e) => {
                dioxus.send({ type: 'beam-selected', data: e.detail });
            });
            window.addEventListener('beam-deselected', (e) => {
                dioxus.send({ type: 'beam-deselected', data: e.detail });
            });
            window.addEventListener('beams-cleared', (e) => {
                dioxus.send({ type: 'beams-cleared' });
            });
        "#);

        spawn(async move {
            while let Ok(msg) = eval.recv().await {
                if let Ok(val) = serde_json::from_value::<serde_json::Value>(msg) {
                    if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
                        match msg_type {
                            "beam-selected" => {
                                if let Some(data) = val.get("data") {
                                    if let Some(id) = data.get("id").and_then(|i| i.as_u64()) {
                                        let section_id = data.get("sectionId")
                                            .and_then(|s| s.as_str())
                                            .map(|s| s.to_string());
                                        
                                        let mut beams = selected_beams.write();
                                        let info = SelectedBeamInfo { 
                                            id: id as usize, 
                                            section_id 
                                        };
                                        if !beams.iter().any(|b| b.id == info.id) {
                                            beams.push(info);
                                        }
                                        drop(beams);
                                        
                                        // Auto-show panel when beam is selected
                                        show.set(true);
                                    }
                                }
                            }
                            "beam-deselected" => {
                                if let Some(data) = val.get("data") {
                                    if let Some(id) = data.get("id").and_then(|i| i.as_u64()) {
                                        let mut beams = selected_beams.write();
                                        beams.retain(|b| b.id != id as usize);
                                    }
                                }
                            }
                            "beams-cleared" => {
                                selected_beams.write().clear();
                            }
                            _ => {}
                        }
                    }
                }
            }
        });
    });

    // Save form to section
    let save_form_to_section = move || {
        let section_type = match form_type().as_str() {
            "Circular" => SectionType::Circular,
            "IBeam" => SectionType::IBeam,
            _ => SectionType::Rectangular,
        };
        
        BeamSection {
            id: generate_section_id(),
            name: form_name(),
            section_type,
            width: form_width(),
            height: form_height(),
            flange_thickness: form_flange(),
            web_thickness: form_web(),
            color: form_color(),
        }
    };

    // Apply section to selected beams
    let apply_section_to_beams = move |section: &BeamSection| {
        let section_json = serde_json::to_string(section).unwrap_or_default();
        let beam_ids: Vec<usize> = selected_beams.read().iter().map(|b| b.id).collect();
        let beam_ids_json = serde_json::to_string(&beam_ids).unwrap_or_default();
        
        let js = format!(
            r#"
            if (window.applyBeamSection) {{
                window.applyBeamSection({}, {});
            }} else {{
                console.error('applyBeamSection not available');
            }}
            "#,
            beam_ids_json,
            section_json
        );
        eval(&js);
    };

    let is_ibeam = form_type() == "IBeam";
    let is_circular = form_type() == "Circular";

    rsx! {
        div {
            class: "right-panel beam-section-panel",
            style: if show() {
                "transform: translateX(0); pointer-events: auto; width: 320px;"
            } else {
                "transform: translateX(100%); pointer-events: none;"
            },
            
            div { class: "panel-header",
                h3 { "🔩 Beam Sections" }
                button {
                    class: "close-button",
                    onclick: move |_| show.set(false),
                    "×"
                }
            }
            
            div { class: "panel-content",
                // Selected Beams Info
                if !selected_beams.read().is_empty() {
                    div { class: "section selected-beams-section",
                        h4 { "Selected Beams" }
                        div { class: "selected-beams-list",
                            for beam in selected_beams.read().iter() {
                                div { class: "selected-beam-item",
                                    span { "Beam #{beam.id}" }
                                    if let Some(ref sec_id) = beam.section_id {
                                        span { class: "beam-section-tag",
                                            {
                                                sections.read().iter()
                                                    .find(|s| &s.id == sec_id)
                                                    .map(|s| s.name.clone())
                                                    .unwrap_or_else(|| "Unknown".to_string())
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Section List
                div { class: "section",
                    div { class: "section-header",
                        h4 { "Defined Sections" }
                        button {
                            class: "btn-icon add-section-btn",
                            onclick: move |_| {
                                editing_section_idx.set(None);
                                form_name.set("New Section".to_string());
                                form_type.set("Rectangular".to_string());
                                form_width.set(0.3);
                                form_height.set(0.5);
                                form_flange.set(0.015);
                                form_web.set(0.010);
                                // Pick next color
                                let idx = sections.read().len() % SECTION_COLORS.len();
                                form_color.set(SECTION_COLORS[idx].0.to_string());
                                show_editor.set(true);
                            },
                            title: "Add new section",
                            "+"
                        }
                    }
                    
                    div { class: "sections-list",
                        for (idx, section) in sections.read().iter().enumerate() {
                            div {
                                class: "section-item",
                                key: "{section.id}",
                                
                                // Color swatch
                                div {
                                    class: "section-color-swatch",
                                    style: "background-color: {section.color};",
                                }
                                
                                // Section info
                                div { class: "section-info",
                                    div { class: "section-name", "{section.name}" }
                                    div { class: "section-dims",
                                        match section.section_type {
                                            SectionType::Rectangular => format!("Rect {:.0}×{:.0}mm", section.width * 1000.0, section.height * 1000.0),
                                            SectionType::Circular => format!("Circ Ø{:.0}mm", section.width * 1000.0),
                                            SectionType::IBeam => format!("I-Beam {:.0}×{:.0}mm", section.width * 1000.0, section.height * 1000.0),
                                        }
                                    }
                                }
                                
                                // Actions
                                div { class: "section-actions",
                                    // Apply to selected beams
                                    if !selected_beams.read().is_empty() {
                                        button {
                                            class: "btn-small btn-apply",
                                            onclick: {
                                                let sec = section.clone();
                                                move |_| {
                                                    apply_section_to_beams(&sec);
                                                }
                                            },
                                            title: "Apply to selected beams",
                                            "Apply"
                                        }
                                    }
                                    
                                    // Edit
                                    button {
                                        class: "btn-icon btn-edit",
                                        onclick: move |_| {
                                            editing_section_idx.set(Some(idx));
                                            // Load section data into form
                                            let secs = sections.read();
                                            if let Some(sec) = secs.get(idx) {
                                                form_name.set(sec.name.clone());
                                                form_type.set(match sec.section_type {
                                                    SectionType::Rectangular => "Rectangular",
                                                    SectionType::Circular => "Circular",
                                                    SectionType::IBeam => "IBeam",
                                                }.to_string());
                                                form_width.set(sec.width);
                                                form_height.set(sec.height);
                                                form_flange.set(sec.flange_thickness);
                                                form_web.set(sec.web_thickness);
                                                form_color.set(sec.color.clone());
                                            }
                                            drop(secs);
                                            show_editor.set(true);
                                        },
                                        title: "Edit section",
                                        "✎"
                                    }
                                    
                                    // Delete (if not the only one)
                                    if sections.read().len() > 1 {
                                        button {
                                            class: "btn-icon btn-delete",
                                            onclick: move |_| {
                                                sections.write().remove(idx);
                                            },
                                            title: "Delete section",
                                            "×"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Section Editor (slide-in)
                if show_editor() {
                    div { class: "section-editor",
                        div { class: "editor-header",
                            h4 { 
                                if editing_section_idx().is_some() { "Edit Section" } else { "New Section" }
                            }
                            button {
                                class: "close-button",
                                onclick: move |_| show_editor.set(false),
                                "×"
                            }
                        }
                        
                        // Name
                        div { class: "property-group",
                            label { "Name" }
                            input {
                                r#type: "text",
                                value: "{form_name}",
                                oninput: move |e| form_name.set(e.value()),
                            }
                        }
                        
                        // Section Type
                        div { class: "property-group",
                            label { "Type" }
                            div { class: "section-type-buttons",
                                button {
                                    class: if form_type() == "Rectangular" { "section-btn active" } else { "section-btn" },
                                    onclick: move |_| form_type.set("Rectangular".to_string()),
                                    div { class: "section-icon rect-icon" }
                                    span { "Rect" }
                                }
                                button {
                                    class: if form_type() == "Circular" { "section-btn active" } else { "section-btn" },
                                    onclick: move |_| form_type.set("Circular".to_string()),
                                    div { class: "section-icon circ-icon" }
                                    span { "Circ" }
                                }
                                button {
                                    class: if form_type() == "IBeam" { "section-btn active" } else { "section-btn" },
                                    onclick: move |_| form_type.set("IBeam".to_string()),
                                    div { class: "section-icon ibeam-icon" }
                                    span { "I-Beam" }
                                }
                            }
                        }
                        
                        // Dimensions
                        if is_circular {
                            div { class: "property-group",
                                label { "Diameter (mm)" }
                                input {
                                    r#type: "number",
                                    value: "{form_width() * 1000.0}",
                                    oninput: move |e| {
                                        if let Ok(val) = e.value().parse::<f64>() {
                                            form_width.set(val / 1000.0);
                                            form_height.set(val / 1000.0);
                                        }
                                    },
                                    step: "10",
                                    min: "10"
                                }
                            }
                        } else {
                            div { class: "property-group",
                                label { if is_ibeam { "Flange Width (mm)" } else { "Width (mm)" } }
                                input {
                                    r#type: "number",
                                    value: "{form_width() * 1000.0}",
                                    oninput: move |e| {
                                        if let Ok(val) = e.value().parse::<f64>() {
                                            form_width.set(val / 1000.0);
                                        }
                                    },
                                    step: "10",
                                    min: "10"
                                }
                            }
                            div { class: "property-group",
                                label { if is_ibeam { "Total Depth (mm)" } else { "Height (mm)" } }
                                input {
                                    r#type: "number",
                                    value: "{form_height() * 1000.0}",
                                    oninput: move |e| {
                                        if let Ok(val) = e.value().parse::<f64>() {
                                            form_height.set(val / 1000.0);
                                        }
                                    },
                                    step: "10",
                                    min: "10"
                                }
                            }
                        }
                        
                        // I-Beam specifics
                        if is_ibeam {
                            div { class: "property-group",
                                label { "Flange Thickness (mm)" }
                                input {
                                    r#type: "number",
                                    value: "{form_flange() * 1000.0}",
                                    oninput: move |e| {
                                        if let Ok(val) = e.value().parse::<f64>() {
                                            form_flange.set(val / 1000.0);
                                        }
                                    },
                                    step: "1",
                                    min: "1"
                                }
                            }
                            div { class: "property-group",
                                label { "Web Thickness (mm)" }
                                input {
                                    r#type: "number",
                                    value: "{form_web() * 1000.0}",
                                    oninput: move |e| {
                                        if let Ok(val) = e.value().parse::<f64>() {
                                            form_web.set(val / 1000.0);
                                        }
                                    },
                                    step: "1",
                                    min: "1"
                                }
                            }
                        }
                        
                        // Color picker
                        div { class: "property-group",
                            label { "Display Color" }
                            div { class: "color-picker-row",
                                for (color, name) in SECTION_COLORS.iter() {
                                    button {
                                        class: if form_color() == *color { "color-swatch selected" } else { "color-swatch" },
                                        style: "background-color: {color};",
                                        title: "{name}",
                                        onclick: {
                                            let c = color.to_string();
                                            move |_| form_color.set(c.clone())
                                        },
                                    }
                                }
                            }
                        }
                        
                        // Section Preview
                        div { class: "property-group",
                            label { "Preview" }
                            div { class: "section-preview",
                                style: "border-color: {form_color()};",
                                if is_circular {
                                    svg {
                                        width: "80",
                                        height: "80",
                                        view_box: "0 0 80 80",
                                        circle {
                                            cx: "40",
                                            cy: "40",
                                            r: "32",
                                            fill: "none",
                                            stroke: "{form_color()}",
                                            stroke_width: "3"
                                        }
                                    }
                                } else if is_ibeam {
                                    svg {
                                        width: "80",
                                        height: "80",
                                        view_box: "0 0 80 80",
                                        // Top flange
                                        rect {
                                            x: "12", y: "8", width: "56", height: "10",
                                            fill: "{form_color()}"
                                        }
                                        // Web
                                        rect {
                                            x: "32", y: "18", width: "16", height: "44",
                                            fill: "{form_color()}"
                                        }
                                        // Bottom flange
                                        rect {
                                            x: "12", y: "62", width: "56", height: "10",
                                            fill: "{form_color()}"
                                        }
                                    }
                                } else {
                                    svg {
                                        width: "80",
                                        height: "80",
                                        view_box: "0 0 80 80",
                                        rect {
                                            x: "16", y: "12", width: "48", height: "56",
                                            fill: "none",
                                            stroke: "{form_color()}",
                                            stroke_width: "3"
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Calculated Properties
                        div { class: "property-group calculated-props",
                            label { "Properties" }
                            {
                                let temp_section = save_form_to_section();
                                rsx! {
                                    div { class: "prop-row",
                                        span { class: "prop-label", "Area:" }
                                        span { class: "prop-value", "{temp_section.area() * 1e6:.1} mm²" }
                                    }
                                    div { class: "prop-row",
                                        span { class: "prop-label", "Iy:" }
                                        span { class: "prop-value", "{temp_section.iy() * 1e12:.0} mm⁴" }
                                    }
                                    div { class: "prop-row",
                                        span { class: "prop-label", "Iz:" }
                                        span { class: "prop-value", "{temp_section.iz() * 1e12:.0} mm⁴" }
                                    }
                                }
                            }
                        }
                        
                        // Save/Cancel buttons
                        div { class: "editor-footer",
                            button {
                                class: "btn-secondary",
                                onclick: move |_| show_editor.set(false),
                                "Cancel"
                            }
                            button {
                                class: "btn-primary",
                                onclick: move |_| {
                                    let new_section = save_form_to_section();
                                    
                                    if let Some(idx) = editing_section_idx() {
                                        // Update existing
                                        let mut secs = sections.write();
                                        if let Some(sec) = secs.get_mut(idx) {
                                            sec.name = new_section.name;
                                            sec.section_type = new_section.section_type;
                                            sec.width = new_section.width;
                                            sec.height = new_section.height;
                                            sec.flange_thickness = new_section.flange_thickness;
                                            sec.web_thickness = new_section.web_thickness;
                                            sec.color = new_section.color;
                                            
                                            // Update beams with this section in canvas
                                            let sec_clone = sec.clone();
                                            drop(secs);
                                            let section_json = serde_json::to_string(&sec_clone).unwrap_or_default();
                                            eval(&format!(
                                                r#"if (window.updateSectionDefinition) {{ window.updateSectionDefinition({}); }}"#,
                                                section_json
                                            ));
                                        }
                                    } else {
                                        // Add new
                                        sections.write().push(new_section);
                                    }
                                    
                                    show_editor.set(false);
                                },
                                "Save"
                            }
                        }
                    }
                }
            }
        }
    }
}
