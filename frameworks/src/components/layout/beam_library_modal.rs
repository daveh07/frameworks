use dioxus::prelude::*;

#[derive(Clone, PartialEq, Debug)]
pub struct BeamType {
    pub id: usize,
    pub name: String,
    pub section_shape: String,  // "I-Beam", "Rectangular", "Circular", etc.
    pub material: String,
    pub display_color: String,  // Hex color
    pub width: f64,
    pub height: f64,
    pub youngs_modulus: f64,
    pub density: f64,
}

impl Default for BeamType {
    fn default() -> Self {
        Self {
            id: 1,
            name: "Default Beam".to_string(),
            section_shape: "I-Beam".to_string(),
            material: "STEEL".to_string(),
            display_color: "#0077ff".to_string(),
            width: 0.2,
            height: 0.4,
            youngs_modulus: 200e9,
            density: 7850.0,
        }
    }
}

#[component]
pub fn BeamLibraryModal(show: Signal<bool>) -> Element {
    let mut beam_types = use_signal(|| vec![
        BeamType {
            id: 1,
            name: "200x400 I-Beam".to_string(),
            section_shape: "I-Beam".to_string(),
            material: "STEEL".to_string(),
            display_color: "#0077ff".to_string(),
            width: 0.2,
            height: 0.4,
            youngs_modulus: 200e9,
            density: 7850.0,
        },
        BeamType {
            id: 2,
            name: "300x500 I-Beam".to_string(),
            section_shape: "I-Beam".to_string(),
            material: "STEEL".to_string(),
            display_color: "#0099cc".to_string(),
            width: 0.3,
            height: 0.5,
            youngs_modulus: 200e9,
            density: 7850.0,
        },
    ]);
    
    let mut selected_id = use_signal(|| None::<usize>);
    let mut edit_name = use_signal(|| String::new());
    let mut edit_material = use_signal(|| String::new());
    let mut edit_shape = use_signal(|| String::new());
    let mut edit_color = use_signal(|| String::new());

    rsx! {
        if show() {
            div {
                class: "modal-overlay",
                onclick: move |_| show.set(false),
                
                div {
                    class: "modal-content beam-library-modal",
                    onclick: move |e| e.stop_propagation(),
                    
                    div { class: "modal-header",
                        h2 { "Beam Type Library" }
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
                                    let new_id = beam_types.read().iter().map(|b| b.id).max().unwrap_or(0) + 1;
                                    beam_types.write().push(BeamType {
                                        id: new_id,
                                        name: format!("Beam Type {}", new_id),
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
                                        beam_types.write().retain(|b| b.id != id);
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
                                    th { "Section Shape" }
                                    th { "Material" }
                                    th { "Width (m)" }
                                    th { "Height (m)" }
                                    th { "Color" }
                                }
                            }
                            tbody {
                                for beam in beam_types.read().iter() {
                                    tr {
                                        class: if selected_id() == Some(beam.id) { "selected-row" } else { "" },
                                        onclick: {
                                            let beam_id = beam.id;
                                            let beam_clone = beam.clone();
                                            move |_| {
                                                selected_id.set(Some(beam_id));
                                                edit_name.set(beam_clone.name.clone());
                                                edit_material.set(beam_clone.material.clone());
                                                edit_shape.set(beam_clone.section_shape.clone());
                                                edit_color.set(beam_clone.display_color.clone());
                                            }
                                        },
                                        td {
                                            input {
                                                r#type: "radio",
                                                name: "beam-select",
                                                checked: selected_id() == Some(beam.id)
                                            }
                                        }
                                        td { "{beam.id}" }
                                        td {
                                            if selected_id() == Some(beam.id) {
                                                input {
                                                    class: "inline-edit",
                                                    value: "{edit_name}",
                                                    oninput: move |e| edit_name.set(e.value()),
                                                    onblur: {
                                                        let beam_id = beam.id;
                                                        move |_| {
                                                            if let Some(b) = beam_types.write().iter_mut().find(|b| b.id == beam_id) {
                                                                b.name = edit_name();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                "{beam.name}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(beam.id) {
                                                select {
                                                    class: "inline-edit",
                                                    value: "{edit_shape}",
                                                    onchange: {
                                                        let beam_id = beam.id;
                                                        move |e: Event<FormData>| {
                                                            edit_shape.set(e.value());
                                                            if let Some(b) = beam_types.write().iter_mut().find(|b| b.id == beam_id) {
                                                                b.section_shape = e.value();
                                                            }
                                                        }
                                                    },
                                                    option { value: "I-Beam", "I-Beam" }
                                                    option { value: "Rectangular", "Rectangular" }
                                                    option { value: "Circular", "Circular" }
                                                    option { value: "L-Beam", "L-Beam" }
                                                    option { value: "T-Beam", "T-Beam" }
                                                }
                                            } else {
                                                "{beam.section_shape}"
                                            }
                                        }
                                        td {
                                            if selected_id() == Some(beam.id) {
                                                select {
                                                    class: "inline-edit",
                                                    value: "{edit_material}",
                                                    onchange: {
                                                        let beam_id = beam.id;
                                                        move |e: Event<FormData>| {
                                                            edit_material.set(e.value());
                                                            if let Some(b) = beam_types.write().iter_mut().find(|b| b.id == beam_id) {
                                                                b.material = e.value();
                                                            }
                                                        }
                                                    },
                                                    option { value: "STEEL", "STEEL" }
                                                    option { value: "CONCRETE", "CONCRETE" }
                                                    option { value: "ALUMINUM", "ALUMINUM" }
                                                }
                                            } else {
                                                "{beam.material}"
                                            }
                                        }
                                        td { "{beam.width:.3}" }
                                        td { "{beam.height:.3}" }
                                        td {
                                            if selected_id() == Some(beam.id) {
                                                input {
                                                    class: "inline-edit color-input",
                                                    r#type: "color",
                                                    value: "{edit_color}",
                                                    onchange: {
                                                        let beam_id = beam.id;
                                                        move |e: Event<FormData>| {
                                                            edit_color.set(e.value());
                                                            if let Some(b) = beam_types.write().iter_mut().find(|b| b.id == beam_id) {
                                                                b.display_color = e.value();
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                div {
                                                    class: "color-display",
                                                    style: "background-color: {beam.display_color};"
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
                                // Save beam types to global state
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
