use dioxus::prelude::*;

#[derive(Clone, PartialEq, Debug)]
pub struct PlateType {
    pub id: usize,
    pub name: String,
    pub material: String,
    pub thickness: f64,
    pub display_color: String,  // Hex color
    pub youngs_modulus: f64,
    pub poissons_ratio: f64,
    pub density: f64,
}

impl Default for PlateType {
    fn default() -> Self {
        Self {
            id: 1,
            name: "Default Plate".to_string(),
            material: "STEEL".to_string(),
            thickness: 0.2,
            display_color: "#808080".to_string(),
            youngs_modulus: 200e9,
            poissons_ratio: 0.25,
            density: 7850.0,
        }
    }
}

#[component]
pub fn PlateLibraryModal(show: Signal<bool>) -> Element {
    let mut plate_types = use_signal(|| vec![
        PlateType {
            id: 1,
            name: "200mm Steel Plate".to_string(),
            material: "STEEL".to_string(),
            thickness: 0.2,
            display_color: "#808080".to_string(),
            youngs_modulus: 200e9,
            poissons_ratio: 0.25,
            density: 7850.0,
        },
        PlateType {
            id: 2,
            name: "150mm Concrete Slab".to_string(),
            material: "CONCRETE".to_string(),
            thickness: 0.15,
            display_color: "#a0a0a0".to_string(),
            youngs_modulus: 30e9,
            poissons_ratio: 0.2,
            density: 2400.0,
        },
    ]);
    
    let mut selected_id = use_signal(|| None::<usize>);
    let mut edit_name = use_signal(|| String::new());
    let mut edit_material = use_signal(|| String::new());
    let mut edit_thickness = use_signal(|| 0.0f64);
    let mut edit_color = use_signal(|| String::new());

    rsx! {
        if show() {
            div {
                class: "modal-overlay",
                onclick: move |_| show.set(false),
                
                div {
                    class: "modal-content plate-library-modal",
                    onclick: move |e| e.stop_propagation(),
                    
                    div { class: "modal-header",
                        h2 { "Plate Type Library" }
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
                                    let new_id = plate_types.read().iter().map(|p| p.id).max().unwrap_or(0) + 1;
                                    plate_types.write().push(PlateType {
                                        id: new_id,
                                        name: format!("Plate Type {}", new_id),
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
                                        plate_types.write().retain(|p| p.id != id);
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
                                    th { "Material" }
                                    th { "Thickness (m)" }
                                    th { "E (GPa)" }
                                    th { "Density (kg/m³)" }
                                    th { "Color" }
                                }
                            }
                            tbody {
                                for plate in plate_types.read().iter() {
                                    tr {
                                        class: if selected_id() == Some(plate.id) { "selected-row" } else { "" },
                                        onclick: {
                                            let plate_id = plate.id;
                                            let plate_clone = plate.clone();
                                            move |_| {
                                                selected_id.set(Some(plate_id));
                                                edit_name.set(plate_clone.name.clone());
                                                edit_material.set(plate_clone.material.clone());
                                                edit_thickness.set(plate_clone.thickness);
                                                edit_color.set(plate_clone.display_color.clone());
                                            }
                                        },
                                        td {
                                            input {
                                                r#type: "radio",
                                                name: "plate-select",
                                                checked: selected_id() == Some(plate.id)
                                            }
                                        }
                                        td { "{plate.id}" }
                                        td {
                                            if selected_id() == Some(plate.id) {
                                                input {
                                                    class: "inline-edit",
                                                    value: "{edit_name}",
                                                    oninput: move |e| edit_name.set(e.value()),
                                                    onblur: {
                                                        let plate_id = plate.id;
                                                        move |_| {
                                                            if let Some(p) = plate_types.write().iter_mut().find(|p| p.id == plate_id) {
                                                                p.name = edit_name();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{plate.name}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(plate.id) {
                                                select {
                                                    class: "inline-edit",
                                                    value: "{edit_material}",
                                                    onchange: {
                                                        let plate_id = plate.id;
                                                        move |e: Event<FormData>| {
                                                            edit_material.set(e.value());
                                                            if let Some(p) = plate_types.write().iter_mut().find(|p| p.id == plate_id) {
                                                                p.material = e.value();
                                                                // Update material properties
                                                                match e.value().as_str() {
                                                                    "STEEL" => {
                                                                        p.youngs_modulus = 200e9;
                                                                        p.poissons_ratio = 0.25;
                                                                        p.density = 7850.0;
                                                                    }
                                                                    "CONCRETE" => {
                                                                        p.youngs_modulus = 30e9;
                                                                        p.poissons_ratio = 0.2;
                                                                        p.density = 2400.0;
                                                                    }
                                                                    "ALUMINUM" => {
                                                                        p.youngs_modulus = 69e9;
                                                                        p.poissons_ratio = 0.33;
                                                                        p.density = 2700.0;
                                                                    }
                                                                    _ => {}
                                                                }
                                                            }
                                                        }
                                                    },
                                                    option { value: "STEEL", "STEEL" }
                                                    option { value: "CONCRETE", "CONCRETE" }
                                                    option { value: "ALUMINUM", "ALUMINUM" }
                                                }
                                            } else {
                                                "{plate.material}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(plate.id) {
                                                input {
                                                    class: "inline-edit",
                                                    r#type: "number",
                                                    value: "{edit_thickness}",
                                                    step: "0.01",
                                                    oninput: move |e| {
                                                        if let Ok(val) = e.value().parse::<f64>() {
                                                            edit_thickness.set(val);
                                                        }
                                                    },
                                                    onblur: {
                                                        let plate_id = plate.id;
                                                        move |_| {
                                                            if let Some(p) = plate_types.write().iter_mut().find(|p| p.id == plate_id) {
                                                                p.thickness = edit_thickness();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{plate.thickness:.3}"
                                            }
                                        }
                                        td { "{(plate.youngs_modulus / 1e9):.0}" }
                                        td { "{plate.density:.0}" }
                                        td {
                                            if selected_id() == Some(plate.id) {
                                                input {
                                                    class: "inline-edit color-input",
                                                    r#type: "color",
                                                    value: "{edit_color}",
                                                    onchange: {
                                                        let plate_id = plate.id;
                                                        move |e: Event<FormData>| {
                                                            edit_color.set(e.value());
                                                            if let Some(p) = plate_types.write().iter_mut().find(|p| p.id == plate_id) {
                                                                p.display_color = e.value();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                div {
                                                    class: "color-display",
                                                    style: "background-color: {plate.display_color};"
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
                                // Save plate types to global state
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
