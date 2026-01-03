use dioxus::prelude::*;

#[derive(Clone, PartialEq, Debug)]
pub struct MaterialType {
    pub id: usize,
    pub name: String,
    pub youngs_modulus: f64,     // Pa
    pub poissons_ratio: f64,
    pub density: f64,             // kg/m³
    pub thermal_expansion: f64,   // 1/°C
    pub display_color: String,    // Hex color for visualization
}

impl Default for MaterialType {
    fn default() -> Self {
        Self {
            id: 1,
            name: "STEEL".to_string(),
            youngs_modulus: 200e9,
            poissons_ratio: 0.25,
            density: 7850.0,
            thermal_expansion: 1.17e-5,
            display_color: "#808080".to_string(),
        }
    }
}

#[component]
pub fn MaterialLibraryModal(show: Signal<bool>) -> Element {
    // Get material library from context
    let mut material_library = use_context::<crate::hooks::MaterialLibrary>();
    
    // Initialize from context
    let initial_materials: Vec<MaterialType> = material_library.materials.read().iter().enumerate().map(|(idx, m)| MaterialType {
        id: idx + 1,
        name: m.name.clone(),
        youngs_modulus: m.youngs_modulus,
        poissons_ratio: m.poissons_ratio,
        density: m.density,
        thermal_expansion: m.thermal_expansion,
        display_color: m.display_color.clone(),
    }).collect();
    
    let mut material_types = use_signal(|| initial_materials);
    
    let mut selected_id = use_signal(|| None::<usize>);
    let mut edit_name = use_signal(|| String::new());
    let mut edit_youngs = use_signal(|| 0.0f64);
    let mut edit_poissons = use_signal(|| 0.0f64);
    let mut edit_density = use_signal(|| 0.0f64);
    let mut edit_thermal = use_signal(|| 0.0f64);
    let mut edit_color = use_signal(|| String::new());

    rsx! {
        if show() {
            div {
                class: "modal-overlay",
                onclick: move |_| show.set(false),
                
                div {
                    class: "modal-content material-library-modal",
                    onclick: move |e| e.stop_propagation(),
                    
                    div { class: "modal-header",
                        h2 { "Material Library" }
                        button {
                            class: "modal-close-button",
                            onclick: move |_| show.set(false),
                            "×"
                        }
                    }
                    
                    div { class: "modal-body",
                        div { class: "library-controls",
                            button {
                                class: "library-button add-button",
                                onclick: move |_| {
                                    let new_id = material_types.read().iter().map(|m| m.id).max().unwrap_or(0) + 1;
                                    material_types.write().push(MaterialType {
                                        id: new_id,
                                        name: format!("Material {}", new_id),
                                        ..Default::default()
                                    });
                                },
                                "+ Add"
                            }
                            button {
                                class: "library-button remove-button",
                                disabled: selected_id().is_none(),
                                onclick: move |_| {
                                    if let Some(id) = selected_id() {
                                        material_types.write().retain(|m| m.id != id);
                                        selected_id.set(None);
                                    }
                                },
                                "- Remove"
                            }
                        }
                        
                        table { class: "library-table",
                            thead {
                                tr {
                                    th { "Select" }
                                    th { "ID" }
                                    th { "Name" }
                                    th { "E (GPa)" }
                                    th { "Poisson's Ratio" }
                                    th { "Density (kg/m³)" }
                                    th { "Thermal α (1/°C)" }
                                    th { "Color" }
                                }
                            }
                            tbody {
                                for material in material_types.read().iter() {
                                    tr {
                                        class: if selected_id() == Some(material.id) { "selected-row" } else { "" },
                                        onclick: {
                                            let mat_id = material.id;
                                            let mat_clone = material.clone();
                                            move |_| {
                                                selected_id.set(Some(mat_id));
                                                edit_name.set(mat_clone.name.clone());
                                                edit_youngs.set(mat_clone.youngs_modulus);
                                                edit_poissons.set(mat_clone.poissons_ratio);
                                                edit_density.set(mat_clone.density);
                                                edit_thermal.set(mat_clone.thermal_expansion);
                                                edit_color.set(mat_clone.display_color.clone());
                                            }
                                        },
                                        td {
                                            input {
                                                r#type: "radio",
                                                name: "material-select",
                                                checked: selected_id() == Some(material.id)
                                            }
                                        }
                                        td { "{material.id}" }
                                        td {
                                            if selected_id() == Some(material.id) {
                                                input {
                                                    class: "inline-edit",
                                                    value: "{edit_name}",
                                                    oninput: move |e| edit_name.set(e.value()),
                                                    onblur: {
                                                        let mat_id = material.id;
                                                        move |_| {
                                                            if let Some(m) = material_types.write().iter_mut().find(|m| m.id == mat_id) {
                                                                m.name = edit_name();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{material.name}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(material.id) {
                                                input {
                                                    class: "inline-edit",
                                                    r#type: "number",
                                                    value: "{(edit_youngs() / 1e9):.0}",
                                                    step: "1",
                                                    oninput: move |e| {
                                                        if let Ok(val) = e.value().parse::<f64>() {
                                                            edit_youngs.set(val * 1e9);
                                                        }
                                                    },
                                                    onblur: {
                                                        let mat_id = material.id;
                                                        move |_| {
                                                            if let Some(m) = material_types.write().iter_mut().find(|m| m.id == mat_id) {
                                                                m.youngs_modulus = edit_youngs();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{(material.youngs_modulus / 1e9):.0}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(material.id) {
                                                input {
                                                    class: "inline-edit",
                                                    r#type: "number",
                                                    value: "{edit_poissons()}",
                                                    step: "0.01",
                                                    oninput: move |e| {
                                                        if let Ok(val) = e.value().parse::<f64>() {
                                                            edit_poissons.set(val);
                                                        }
                                                    },
                                                    onblur: {
                                                        let mat_id = material.id;
                                                        move |_| {
                                                            if let Some(m) = material_types.write().iter_mut().find(|m| m.id == mat_id) {
                                                                m.poissons_ratio = edit_poissons();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{material.poissons_ratio:.2}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(material.id) {
                                                input {
                                                    class: "inline-edit",
                                                    r#type: "number",
                                                    value: "{edit_density():.0}",
                                                    step: "10",
                                                    oninput: move |e| {
                                                        if let Ok(val) = e.value().parse::<f64>() {
                                                            edit_density.set(val);
                                                        }
                                                    },
                                                    onblur: {
                                                        let mat_id = material.id;
                                                        move |_| {
                                                            if let Some(m) = material_types.write().iter_mut().find(|m| m.id == mat_id) {
                                                                m.density = edit_density();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{material.density:.0}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(material.id) {
                                                input {
                                                    class: "inline-edit",
                                                    r#type: "text",
                                                    value: "{edit_thermal():.2e}",
                                                    oninput: move |e| {
                                                        if let Ok(val) = e.value().parse::<f64>() {
                                                            edit_thermal.set(val);
                                                        }
                                                    },
                                                    onblur: {
                                                        let mat_id = material.id;
                                                        move |_| {
                                                            if let Some(m) = material_types.write().iter_mut().find(|m| m.id == mat_id) {
                                                                m.thermal_expansion = edit_thermal();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{material.thermal_expansion:.2e}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(material.id) {
                                                input {
                                                    class: "inline-edit color-input",
                                                    r#type: "color",
                                                    value: "{edit_color}",
                                                    onchange: {
                                                        let mat_id = material.id;
                                                        move |e: Event<FormData>| {
                                                            edit_color.set(e.value());
                                                            if let Some(m) = material_types.write().iter_mut().find(|m| m.id == mat_id) {
                                                                m.display_color = e.value();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                div {
                                                    class: "color-display",
                                                    style: "background-color: {material.display_color};"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    div { class: "modal-footer",
                        button {
                            class: "modal-button apply-button",
                            onclick: move |_| {
                                // Save material types to global context
                                let materials: Vec<crate::hooks::Material> = material_types.read().iter().map(|m| crate::hooks::Material {
                                    name: m.name.clone(),
                                    youngs_modulus: m.youngs_modulus,
                                    poissons_ratio: m.poissons_ratio,
                                    density: m.density,
                                    thermal_expansion: m.thermal_expansion,
                                    display_color: m.display_color.clone(),
                                }).collect();
                                material_library.update_materials(materials);
                                show.set(false);
                            },
                            "Apply"
                        }
                        button {
                            class: "modal-button close-button",
                            onclick: move |_| show.set(false),
                            "Close"
                        }
                    }
                }
            }
        }
    }
}
